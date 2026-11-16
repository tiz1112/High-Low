'use strict';
/* ============================================================
   ui.js ─ 画面を作る・書き換える係

   ルール（rules.js）も、いくら持っているか（main.js）も知りません。
   「この札を描いて」「この数字を出して」と言われたとおりに描くだけです。
   ============================================================ */

const $ = function (s) { return document.querySelector(s); };
const $$ = function (s) { return Array.prototype.slice.call(document.querySelectorAll(s)); };

function yen(n) { return Math.round(n).toLocaleString('ja-JP'); }


/* ------------------------------------------------------------
   マークの並べ方

   トランプの2〜10は、マークを決まった位置に並べます。
   [左右の位置%, 上下の位置%, 逆さにするか] の形で書いてあります。
   下半分のマークは、本物と同じように180度回しています。
   ------------------------------------------------------------ */
const PIP_LAYOUT = {
    2: [[50, 16, 0], [50, 84, 1]],
    3: [[50, 16, 0], [50, 50, 0], [50, 84, 1]],
    4: [[25, 16, 0], [75, 16, 0], [25, 84, 1], [75, 84, 1]],
    5: [[25, 16, 0], [75, 16, 0], [50, 50, 0], [25, 84, 1], [75, 84, 1]],
    6: [[25, 16, 0], [75, 16, 0], [25, 50, 0], [75, 50, 0], [25, 84, 1], [75, 84, 1]],
    7: [[25, 16, 0], [75, 16, 0], [50, 33, 0], [25, 50, 0], [75, 50, 0], [25, 84, 1], [75, 84, 1]],
    8: [[25, 16, 0], [75, 16, 0], [50, 33, 0], [25, 50, 0], [75, 50, 0], [50, 67, 1], [25, 84, 1], [75, 84, 1]],
    9: [[25, 16, 0], [75, 16, 0], [25, 39, 0], [75, 39, 0], [50, 50, 0],
        [25, 61, 1], [75, 61, 1], [25, 84, 1], [75, 84, 1]],
    10: [[25, 16, 0], [75, 16, 0], [50, 27, 0], [25, 39, 0], [75, 39, 0],
         [25, 61, 1], [75, 61, 1], [50, 73, 1], [25, 84, 1], [75, 84, 1]]
};


/* ------------------------------------------------------------
   札の表を1枚作る
   ------------------------------------------------------------ */
function cardFace(card) {
    const el = document.createElement('div');
    el.className = 'card' + (Rules.isRed(card.suit) ? ' is-red' : '');

    const label = Rules.rankLabel(card.rank);
    const mark = Rules.SUIT_MARK[card.suit];

    // 左上と右下の、数字とマーク
    ['tl', 'br'].forEach(function (pos) {
        const corner = document.createElement('div');
        corner.className = 'c-corner ' + pos;

        const rank = document.createElement('span');
        rank.className = 'c-rank';
        rank.textContent = label;

        const suit = document.createElement('span');
        suit.className = 'c-suit';
        suit.textContent = mark;

        corner.appendChild(rank);
        corner.appendChild(suit);
        el.appendChild(corner);
    });

    if (card.rank >= 11) {
        // J・Q・K は金の飾り文字
        const court = document.createElement('div');
        court.className = 'c-court';

        const letter = document.createElement('span');
        letter.className = 'c-court-letter';
        letter.textContent = label;

        const suit = document.createElement('span');
        suit.className = 'c-court-suit';
        suit.textContent = mark;

        court.appendChild(letter);
        court.appendChild(suit);
        el.appendChild(court);

    } else {
        // A〜10 はマークを並べる
        const pips = document.createElement('div');
        pips.className = 'c-pips';

        if (card.rank === 1) {
            const pip = document.createElement('span');
            pip.className = 'pip ace';
            pip.style.left = '50%';
            pip.style.top = '50%';
            pip.textContent = mark;
            pips.appendChild(pip);
        } else {
            PIP_LAYOUT[card.rank].forEach(function (p) {
                const pip = document.createElement('span');
                pip.className = 'pip' + (p[2] ? ' flip' : '');
                pip.style.left = p[0] + '%';
                pip.style.top = p[1] + '%';
                pip.textContent = mark;
                pips.appendChild(pip);
            });
        }

        el.appendChild(pips);
    }

    return el;
}


/* 札の裏を1枚作る */
function cardBack() {
    const el = document.createElement('div');
    el.className = 'card-back';
    return el;
}


/* めくれる札（表と裏を背中合わせにしたもの）を作る
   最初は裏向き。is-open を付けると表が見えます。 */
function flipCard(card) {
    const wrap = document.createElement('div');
    wrap.className = 'card3d';

    const inner = document.createElement('div');
    inner.className = 'card3d-inner';

    const back = document.createElement('div');
    back.className = 'card3d-face card3d-back';
    back.appendChild(cardBack());

    const front = document.createElement('div');
    front.className = 'card3d-face card3d-front';
    front.appendChild(cardFace(card));

    inner.appendChild(back);
    inner.appendChild(front);
    wrap.appendChild(inner);
    return wrap;
}


/* ============================================================
   卓まわり
   ============================================================ */
const Table = {

    /* 山札の絵を作る
       紙が重なっている厚みを、少しずつずらした5枚で表しています。
       この山の一番上が、その場でめくれて次の札になります。 */
    buildDeck: function () {
        const stack = $('#deckStack');
        stack.innerHTML = '';
        for (let i = 4; i >= 0; i--) {
            const sheet = document.createElement('div');
            sheet.className = 'deck-sheet';
            sheet.style.transform = 'translate(' + (i * -1.4) + 'px,' + (i * -2) + 'px)';
            sheet.appendChild(cardBack());
            stack.appendChild(sheet);
        }
    },

    setDeckCount: function (n) {
        $('#deckCount').textContent = n + '枚';
        // 残りが少なくなったら、山を薄く見せます
        $('#deckStack').style.opacity = n > 0 ? 1 : 0;
    },

    /* 場の札を置く（めくる動きなし） */
    setCurrent: function (card) {
        const spot = $('#spotCurrent');
        spot.className = 'spot spot-current';
        spot.innerHTML = '';
        if (card) spot.appendChild(cardFace(card));
    },

    /* 次の札を、山札の上に裏向きで重ねる → あとで open() でめくります */
    placeNext: function (card) {
        const spot = $('#spotNext');
        spot.className = 'spot spot-next';

        // 前に置いた札が残っていたら片づける
        const old = spot.querySelector('.flip-layer');
        if (old) old.remove();

        const layer = document.createElement('div');
        layer.className = 'flip-layer';
        const flip = flipCard(card);
        layer.appendChild(flip);
        spot.appendChild(layer);

        return flip;
    },

    openNext: function (flip) {
        flip.classList.add('is-open');
    },

    markNext: function (win) {
        $('#spotNext').classList.add(win ? 'is-win' : 'is-lose');
    },

    /* 場の札を左へ流して消す */
    sweepCurrent: function () {
        $('#spotCurrent').classList.add('is-leaving');
    },

    /* めくった札を片づけて、山札だけの状態に戻す */
    clearNext: function () {
        const spot = $('#spotNext');
        spot.className = 'spot spot-next';
        const layer = spot.querySelector('.flip-layer');
        if (layer) layer.remove();
    }
};


/* ============================================================
   連勝の帯と倍率
   ============================================================ */
const Chain = {

    /* 引いた札を帯に1枚足す
       kind … 'win' / 'same' / 'bust' */
    push: function (card, kind) {
        const rail = $('#chainRail');

        const item = document.createElement('div');
        item.className = 'chain-item' + (kind === 'same' ? ' is-same' : (kind === 'bust' ? ' is-bust' : ''));
        item.style.setProperty('--card-w', '34px');
        item.style.width = '34px';
        item.style.height = '48px';
        item.appendChild(cardFace(card));

        rail.appendChild(item);
        rail.scrollLeft = rail.scrollWidth;   // 右端が見えるように
    },

    clear: function () {
        $('#chainRail').innerHTML = '';
    },

    /* 倍率を表示する。
       前の値から今の値へ、数字が転がって上がるようにしています。 */
    setMultiplier: function (from, to, stake) {
        const el = $('#multValue');
        const pay = $('#payValue');

        // 倍率が上がるほど強く光らせます（10倍で最大）
        el.style.setProperty('--glow', Math.min(1, (to - 1) / 9).toFixed(3));

        const start = performance.now();
        const dur = 420;

        function step(now) {
            const t = Math.min(1, (now - start) / dur);
            // 終わりに近づくほどゆっくりになる動き
            const eased = 1 - Math.pow(1 - t, 3);
            const v = from + (to - from) * eased;

            el.textContent = '×' + v.toFixed(2);
            pay.textContent = stake > 0 ? yen(Math.floor(stake * v)) + '円' : '—';

            if (t < 1) requestAnimationFrame(step);
        }
        requestAnimationFrame(step);
    },

    setMultiplierNow: function (v, stake) {
        $('#multValue').textContent = '×' + v.toFixed(2);
        $('#multValue').style.setProperty('--glow', Math.min(1, (v - 1) / 9).toFixed(3));
        $('#payValue').textContent = stake > 0 ? yen(Math.floor(stake * v)) + '円' : '—';
    }
};


/* ============================================================
   残っている札
   ============================================================ */
const Remain = {

    build: function () {
        const grid = $('#remainGrid');
        grid.innerHTML = '';
        for (let r = Rules.RANK_MIN; r <= Rules.RANK_MAX; r++) {
            const cell = document.createElement('div');
            cell.className = 'rm';
            cell.dataset.rank = r;

            const rank = document.createElement('span');
            rank.className = 'rm-rank';
            rank.textContent = Rules.rankLabel(r);

            const count = document.createElement('span');
            count.className = 'rm-count';
            count.textContent = '4';

            cell.appendChild(rank);
            cell.appendChild(count);
            grid.appendChild(cell);
        }
    },

    /* counts … 数字ごとの残り枚数
       currentRank … いまの札の数字（色分けの基準） */
    update: function (counts, currentRank) {
        $$('#remainGrid .rm').forEach(function (cell) {
            const r = Number(cell.dataset.rank);
            const n = counts[r] || 0;

            cell.querySelector('.rm-count').textContent = n;

            let cls = 'rm';
            if (n === 0) cls += ' is-empty';
            if (currentRank != null) {
                if (r > currentRank) cls += ' is-high';
                else if (r < currentRank) cls += ' is-low';
                else cls += ' is-same';
            }
            cell.className = cls;
        });
    }
};


/* ============================================================
   三択のボタン
   ============================================================ */
const Guesses = {

    /* ch … rules.chances() が返したもの */
    update: function (ch) {
        [['high', '#multHigh', '#probHigh', '#btnHigh'],
         ['same', '#multSame', '#probSame', '#btnSame'],
         ['low', '#multLow', '#probLow', '#btnLow']].forEach(function (x) {
            const info = ch[x[0]];
            const mult = $(x[1]);
            const prob = $(x[2]);
            const btn = $(x[3]);

            if (info.possible) {
                mult.textContent = '×' + info.mult.toFixed(2);
                prob.textContent = Math.round(info.prob * 100) + '%';
                btn.disabled = false;
            } else {
                mult.textContent = '—';
                prob.textContent = 'なし';
                btn.disabled = true;
            }
        });
    },

    setEnabled: function (on) {
        ['#btnHigh', '#btnSame', '#btnLow'].forEach(function (s) {
            if (!on) $(s).disabled = true;
        });
    }
};


/* ============================================================
   チップ（賭け金）
   ============================================================ */
const Chips = {

    DENOMS: [
        { v: 100, face: '#f4f1e8', edge: '#a81f33', text: '#2a1d06' },
        { v: 500, face: '#a81f33', edge: '#f5f0e4', text: '#fff6e6' },
        { v: 1000, face: '#1d4a86', edge: '#f5f0e4', text: '#fff6e6' },
        { v: 5000, face: '#1b6446', edge: '#f5f0e4', text: '#fff6e6' },
        { v: 10000, face: '#17130f', edge: '#cfae68', text: '#efdca6' }
    ],

    selected: 1000,
    els: [],

    build: function (onSelect) {
        const wrap = $('#chips');
        wrap.innerHTML = '';
        this.els = [];
        const self = this;

        this.DENOMS.forEach(function (d) {
            const b = document.createElement('button');
            b.className = 'chip';
            b.type = 'button';
            b.dataset.value = d.v;
            b.style.setProperty('--chip-face', d.face);
            b.style.setProperty('--chip-edge', d.edge);
            b.style.setProperty('--chip-text', d.text);

            const s = document.createElement('span');
            s.textContent = d.v >= 10000 ? (d.v / 10000) + '万' : d.v;
            b.appendChild(s);

            b.addEventListener('click', function () {
                self.select(d.v);
                onSelect(d.v);
            });

            wrap.appendChild(b);
            self.els.push(b);
        });

        this.select(this.selected);
    },

    select: function (v) {
        this.selected = v;
        this.els.forEach(function (el) {
            el.classList.toggle('is-on', Number(el.dataset.value) === v);
        });
    },

    limitTo: function (balance) {
        this.els.forEach(function (el) {
            el.disabled = Number(el.dataset.value) > balance;
        });
    },

    lock: function (locked) {
        $('#stakeRow').classList.toggle('is-locked', locked);
    }
};


/* ============================================================
   演出
   ============================================================ */
const Fx = {

    verdict: function (text, kind) {
        const el = $('#verdict');
        el.className = 'verdict';
        // 一度クラスを外してから付け直さないと、同じ動きが再生されません
        void el.offsetWidth;
        el.textContent = text;
        el.className = 'verdict ' + kind + ' is-on';
    },

    /* 画面の中央から金の粒を散らす */
    sparks: function (count) {
        const wrap = $('#sparks');
        const cx = window.innerWidth / 2;
        const cy = window.innerHeight * 0.42;

        for (let i = 0; i < count; i++) {
            const s = document.createElement('i');
            s.className = 'spark';
            s.style.left = cx + 'px';
            s.style.top = cy + 'px';

            const angle = Math.random() * Math.PI * 2;
            const dist = 90 + Math.random() * 190;
            s.style.setProperty('--dx', Math.cos(angle) * dist + 'px');
            s.style.setProperty('--dy', (Math.sin(angle) * dist - 60) + 'px');
            s.style.animationDelay = (Math.random() * 0.18) + 's';

            wrap.appendChild(s);
            setTimeout(function () { s.remove(); }, 1500);
        }
    },

    bust: function (on) {
        document.body.classList.toggle('is-bust', on);
    },

    busy: function (on) {
        document.querySelector('.app').classList.toggle('is-busy', on);
    }
};


/* ============================================================
   下から出てくるシート
   ============================================================ */
function initSheets() {
    $('#btnStats').addEventListener('click', function () { $('#sheetStats').classList.add('is-open'); });
    $('#btnHelp').addEventListener('click', function () { $('#sheetHelp').classList.add('is-open'); });

    $$('.sheet-close').forEach(function (b) {
        b.addEventListener('click', function () {
            $('#' + b.dataset.close).classList.remove('is-open');
        });
    });

    // 外側をタップしても閉じます
    $$('.sheet').forEach(function (sheet) {
        sheet.addEventListener('click', function (e) {
            if (e.target === sheet) sheet.classList.remove('is-open');
        });
    });
}


/* ============================================================
   記録のシートの中身
   ============================================================ */
const Stats = {

    render: function (s) {
        const dl = $('#statsList');
        dl.innerHTML = '';

        const rows = [
            ['勝負した回数', s.runs + '回'],
            ['賭けた合計', yen(s.staked) + '円'],
            ['受け取った合計', yen(s.returned) + '円'],
            ['差し引き', (s.returned - s.staked > 0 ? '+' : '') + yen(s.returned - s.staked) + '円'],
            ['実際の還元率', s.staked > 0 ? (s.returned / s.staked * 100).toFixed(1) + '%' : '—'],
            ['当てた回数', s.hits + '回'],
            ['最高連勝', s.bestSteps + '連勝'],
            ['最高倍率', '×' + s.bestMult.toFixed(2)],
            ['最高の受取額', yen(s.bestWin) + '円'],
            ['最高残高', yen(s.peak) + '円']
        ];

        rows.forEach(function (r) {
            const dt = document.createElement('dt');
            dt.textContent = r[0];
            const dd = document.createElement('dd');
            dd.textContent = r[1];
            dl.appendChild(dt);
            dl.appendChild(dd);
        });
    },

    renderRuns: function (runs) {
        const wrap = $('#runsList');
        wrap.innerHTML = '';

        if (runs.length === 0) {
            const p = document.createElement('p');
            p.className = 'note';
            p.textContent = 'まだ記録がありません。';
            wrap.appendChild(p);
            return;
        }

        runs.slice(-30).reverse().forEach(function (r) {
            const row = document.createElement('div');
            row.className = 'run-row';

            const no = document.createElement('span');
            no.className = 'run-no';
            no.textContent = '#' + r.no;

            const steps = document.createElement('span');
            steps.className = 'run-steps';
            steps.textContent = r.cashed ? (r.steps + '連勝で降りた') : (r.steps + '連勝で外した');

            const mult = document.createElement('span');
            mult.className = 'run-mult';
            mult.textContent = '×' + r.mult.toFixed(2);

            const pl = document.createElement('span');
            pl.className = 'run-pl ' + (r.net > 0 ? 'plus' : (r.net < 0 ? 'minus' : ''));
            pl.textContent = (r.net > 0 ? '+' : '') + yen(r.net);

            row.appendChild(no);
            row.appendChild(steps);
            row.appendChild(mult);
            row.appendChild(pl);
            wrap.appendChild(row);
        });
    }
};


if (typeof window !== 'undefined') {
    window.UI = {
        $: $, $$: $$, yen: yen,
        cardFace: cardFace, cardBack: cardBack, flipCard: flipCard,
        Table: Table, Chain: Chain, Remain: Remain,
        Guesses: Guesses, Chips: Chips, Fx: Fx, Stats: Stats,
        initSheets: initSheets
    };
}
