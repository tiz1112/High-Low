'use strict';
/* ============================================================
   main.js ─ ゲームの進行を取り仕切る係

   ・いくら持っているか
   ・いま何連勝していて、倍率はいくつか
   ・めくっている最中かどうか

   この3つをここでまとめて持ち、
   ルール（rules.js）と画面（ui.js）に指示を出します。
   ============================================================ */


function sleep(ms) {
    return new Promise(function (r) { setTimeout(r, ms); });
}

const SAVE_KEY = 'highlow.save.v1';
const START_BALANCE = 100000;

// 山がこの枚数を切ったら、新しいひと組に替えます
const RESHUFFLE_AT = 8;


const Game = {

    /* ===== 持っている状態 ===== */
    balance: START_BALANCE,
    stake: 1000,          // 1回の勝負に賭ける額
    shoe: null,           // 山札
    current: null,        // いま場に出ている札
    mult: 1,              // いまの倍率
    steps: 0,             // いま何連勝しているか
    inChain: false,       // 勝負の最中か
    busy: false,          // めくっている最中か
    stats: null,
    runs: [],             // 1回の勝負ごとの記録
    runNo: 0,


    /* ========================================================
       起動
       ======================================================== */
    init() {
        this.load();

        UI.initSheets();
        UI.Table.buildDeck();
        UI.Remain.build();

        const self = this;
        UI.Chips.build(function (v) { self.stake = v; self.refresh(); });
        UI.Chips.select(this.stake);

        this.bindControls();

        // 山を用意して、最初の1枚をめくっておきます
        this.shoe = new Rules.Shoe();
        this.current = this.shoe.draw();
        UI.Table.setCurrent(this.current);

        UI.Chain.setMultiplierNow(1, 0);
        this.refresh();
    },

    bindControls() {
        const self = this;

        UI.$('#btnHigh').addEventListener('click', function () { self.guess('high'); });
        UI.$('#btnSame').addEventListener('click', function () { self.guess('same'); });
        UI.$('#btnLow').addEventListener('click', function () { self.guess('low'); });
        UI.$('#btnCashout').addEventListener('click', function () { self.cashout(); });

        UI.$('#btnResetAll').addEventListener('click', function () {
            if (!confirm('残高と記録を最初の状態に戻します。よろしいですか？')) return;
            localStorage.removeItem(SAVE_KEY);
            location.reload();
        });

        // 記録のシートを開くたびに中身を描き直します
        UI.$('#btnStats').addEventListener('click', function () {
            UI.Stats.render(self.stats);
            UI.Stats.renderRuns(self.runs);
        });

        // キーボードでも遊べるようにしておきます（PC用）
        window.addEventListener('keydown', function (e) {
            if (e.repeat) return;
            if (e.key === 'ArrowUp') { e.preventDefault(); self.guess('high'); }
            if (e.key === 'ArrowDown') { e.preventDefault(); self.guess('low'); }
            if (e.key === '0') { self.guess('same'); }
            if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); self.cashout(); }
        });
    },


    /* ========================================================
       予想する（ここが本体）
       ======================================================== */
    async guess(kind) {
        if (this.busy) return;

        const ch = Rules.chances(this.current.rank, this.shoe.cards);
        if (!ch[kind].possible) return;

        // --- まだ勝負が始まっていなければ、ここで賭け金を出します ---
        if (!this.inChain) {
            if (this.balance < this.stake) {
                UI.Fx.verdict('残高が足りません', 'lose');
                return;
            }
            this.balance -= this.stake;
            this.inChain = true;
            this.mult = 1;
            this.steps = 0;
            this.runNo++;
            this.stats.runs++;
            this.stats.staked += this.stake;
            UI.Chain.clear();
            UI.Chain.setMultiplierNow(1, this.stake);
        }

        this.busy = true;
        UI.Fx.busy(true);
        UI.Fx.bust(false);
        this.refresh();

        // --- 次の札を裏向きで出して、めくる ---
        const next = this.shoe.draw();
        const flip = UI.Table.placeNext(next);
        await sleep(90);
        UI.Table.openNext(flip);
        await sleep(760);                // めくり終わるのを待つ

        // --- 答え合わせ ---
        const win = Rules.judge(kind, this.current.rank, next.rank);
        UI.Table.markNext(win);

        if (win) {
            const before = this.mult;
            this.mult = this.mult * ch[kind].mult;
            this.steps++;

            this.stats.hits++;
            this.stats.bestSteps = Math.max(this.stats.bestSteps, this.steps);
            this.stats.bestMult = Math.max(this.stats.bestMult, this.mult);

            UI.Chain.push(next, kind === 'same' ? 'same' : 'win');
            UI.Chain.setMultiplier(before, this.mult, this.stake);
            UI.Fx.verdict(kind === 'same' ? '同 じ ！' : '的 中', 'win');
            UI.Fx.sparks(kind === 'same' ? 26 : 14);

        } else {
            UI.Chain.push(next, 'bust');
            UI.Fx.verdict('は ず れ', 'lose');
            UI.Fx.bust(true);

            // 勝負終了。賭け金はそのまま負けです。
            this.finishRun(false, 0);
        }

        await sleep(880);

        // --- 次の札を、新しい「場の札」にする ---
        UI.Table.sweepCurrent();
        await sleep(260);

        this.current = next;
        UI.Table.setCurrent(this.current);
        UI.Table.clearNext();
        UI.Fx.bust(false);

        // --- 山が少なくなったら、新しいひと組に替える ---
        if (this.shoe.left < RESHUFFLE_AT) {
            this.shoe.reset(this.current);
            UI.Fx.verdict('新しいひと組', 'win');
        }

        this.busy = false;
        UI.Fx.busy(false);
        this.refresh();
        this.save();
    },


    /* ========================================================
       降りる（受け取って勝負を終える）
       ======================================================== */
    cashout() {
        if (this.busy) return;
        if (!this.inChain || this.steps === 0) return;

        const payout = Math.floor(this.stake * this.mult);

        this.balance += payout;
        this.stats.returned += payout;
        this.stats.bestWin = Math.max(this.stats.bestWin, payout);
        this.stats.peak = Math.max(this.stats.peak, this.balance);

        UI.Fx.verdict('＋' + UI.yen(payout) + ' 円', 'cash');
        UI.Fx.sparks(34);

        this.finishRun(true, payout);
        this.refresh();
        this.save();
    },

    /* 1回の勝負を記録して、状態を戻す */
    finishRun(cashed, payout) {
        this.runs.push({
            no: this.runNo,
            steps: this.steps,
            mult: this.mult,
            cashed: cashed,
            net: payout - this.stake
        });
        if (this.runs.length > 200) this.runs = this.runs.slice(-200);

        this.inChain = false;
        this.steps = 0;
        this.mult = 1;

        UI.Chain.setMultiplierNow(1, 0);
    },


    /* ========================================================
       画面の書き換え
       ======================================================== */
    refresh() {
        // 残高
        UI.$('#balance').textContent = UI.yen(this.balance);

        // 山の残り枚数と、残っている札
        UI.Table.setDeckCount(this.shoe ? this.shoe.left : 0);
        if (this.shoe && this.current) {
            UI.Remain.update(this.shoe.countsByRank(), this.current.rank);
        }

        // 三択の倍率と確率
        if (this.shoe && this.current) {
            const ch = Rules.chances(this.current.rank, this.shoe.cards);
            UI.Guesses.update(ch);
        }
        if (this.busy) UI.Guesses.setEnabled(false);

        // チップ（勝負中は変えられません）
        UI.Chips.lock(this.inChain);
        UI.Chips.limitTo(this.balance);

        // 降りるボタン
        const canCash = this.inChain && this.steps > 0 && !this.busy;
        UI.$('#btnCashout').disabled = !canCash;
        UI.$('#cashoutAmount').textContent =
            canCash ? UI.yen(Math.floor(this.stake * this.mult)) + '円' : '—';

        // 勝負していないときは、賭け金を「獲得予定」の欄に出しておきます
        if (!this.inChain) {
            UI.$('#payValue').textContent = '賭け金 ' + UI.yen(this.stake) + '円';
        }

        this.stats.peak = Math.max(this.stats.peak, this.balance);

        // 遊べなくなったら少しだけ補充します（練習用なので）
        if (!this.inChain && this.balance < 100) {
            this.balance += START_BALANCE;
            UI.Fx.verdict('チップを補充しました', 'win');
            UI.$('#balance').textContent = UI.yen(this.balance);
            UI.Chips.limitTo(this.balance);
        }
    },


    /* ========================================================
       保存と読み込み
       ======================================================== */

    emptyStats() {
        return {
            runs: 0, staked: 0, returned: 0, hits: 0,
            bestSteps: 0, bestMult: 1, bestWin: 0, peak: START_BALANCE
        };
    },

    save() {
        // 勝負の途中は保存しません（途中で閉じたときに
        // 賭け金だけ引かれた状態が残ってしまうため）
        if (this.inChain) return;

        try {
            localStorage.setItem(SAVE_KEY, JSON.stringify({
                balance: this.balance,
                stake: this.stake,
                stats: this.stats,
                runs: this.runs,
                runNo: this.runNo
            }));
        } catch (e) {
            console.warn('保存できませんでした', e);
        }
    },

    load() {
        let data = null;
        try {
            const raw = localStorage.getItem(SAVE_KEY);
            if (raw) data = JSON.parse(raw);
        } catch (e) {
            console.warn('読み込めませんでした', e);
        }

        this.balance = (data && typeof data.balance === 'number') ? data.balance : START_BALANCE;
        this.stake = (data && data.stake) || 1000;
        this.stats = (data && data.stats) || this.emptyStats();
        this.runs = (data && data.runs) || [];
        this.runNo = (data && data.runNo) || 0;

        // 古い保存に項目が足りなくても動くように埋めておきます
        const blank = this.emptyStats();
        const self = this;
        Object.keys(blank).forEach(function (k) {
            if (typeof self.stats[k] !== 'number') self.stats[k] = blank[k];
        });
    }
};


window.addEventListener('DOMContentLoaded', function () {
    Game.init();
});
