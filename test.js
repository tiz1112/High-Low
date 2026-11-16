'use strict';
/* ============================================================
   test.js ─ ルールが正しいか確かめるためのファイル

   使い方（ターミナルで）:
       node test.js

   画面を作る前に、確率と倍率が合っているかをここで確認します。
   ============================================================ */

const R = require('./rules.js');

let pass = 0, fail = 0;

function check(name, actual, expected) {
    if (JSON.stringify(actual) === JSON.stringify(expected)) { pass++; return; }
    fail++;
    console.log('  × ' + name);
    console.log('      期待: ' + JSON.stringify(expected));
    console.log('      実際: ' + JSON.stringify(actual));
}

function near(name, actual, expected, tol) {
    if (Math.abs(actual - expected) <= tol) { pass++; return; }
    fail++;
    console.log('  × ' + name);
    console.log('      期待: ' + expected + ' ± ' + tol);
    console.log('      実際: ' + actual);
}


/* ===== 1. ひと組の中身 ==================================== */
console.log('\n【1】ひと組の中身');

const deck = R.buildDeck();
check('52枚ある', deck.length, 52);

// 同じ札が2枚ないか
const seen = {};
let dup = 0;
deck.forEach(function (c) {
    const key = c.suit + c.rank;
    if (seen[key]) dup++;
    seen[key] = true;
});
check('同じ札はない', dup, 0);

// 数字ごとに4枚ずつ
const byRank = {};
deck.forEach(function (c) { byRank[c.rank] = (byRank[c.rank] || 0) + 1; });
let rankOk = true;
for (let r = 1; r <= 13; r++) if (byRank[r] !== 4) rankOk = false;
check('どの数字も4枚ずつ', rankOk, true);

// マークごとに13枚ずつ
const bySuit = {};
deck.forEach(function (c) { bySuit[c.suit] = (bySuit[c.suit] || 0) + 1; });
check('どのマークも13枚ずつ',
    ['s', 'h', 'd', 'c'].map(function (s) { return bySuit[s]; }), [13, 13, 13, 13]);

check('Aの表示', R.rankLabel(1), 'A');
check('10の表示', R.rankLabel(10), '10');
check('Jの表示', R.rankLabel(11), 'J');
check('Kの表示', R.rankLabel(13), 'K');


/* ===== 2. シャッフル ====================================== */
console.log('【2】シャッフル');

const before = R.buildDeck().map(function (c) { return c.suit + c.rank; }).sort();
const after = R.shuffleInPlace(R.buildDeck()).map(function (c) { return c.suit + c.rank; }).sort();
check('混ぜても札は増えも減りもしない', after, before);

// 混ざっているか（同じ並びのままではないか）
const original = R.buildDeck();
const mixed = R.shuffleInPlace(R.buildDeck());
let samePos = 0;
for (let i = 0; i < 52; i++) {
    if (original[i].rank === mixed[i].rank && original[i].suit === mixed[i].suit) samePos++;
}
check('元の位置に残るのは数枚まで', samePos < 10, true);

// かたよりがないか。1枚目に来る札を10万回数えて、どれも 1/52 に近いか
console.log('      1枚目に来る札のかたよりを調べています…');
const firstCount = {};
const N = 100000;
for (let i = 0; i < N; i++) {
    const d = R.shuffleInPlace(R.buildDeck());
    const key = d[0].suit + d[0].rank;
    firstCount[key] = (firstCount[key] || 0) + 1;
}
let minP = 1, maxP = 0;
Object.keys(firstCount).forEach(function (k) {
    const p = firstCount[k] / N;
    minP = Math.min(minP, p);
    maxP = Math.max(maxP, p);
});
console.log('      最小 ' + (minP * 100).toFixed(3) + '%  最大 ' + (maxP * 100).toFixed(3) +
            '%  （理論 ' + (100 / 52).toFixed(3) + '%）');
check('52種類すべてが1枚目に来た', Object.keys(firstCount).length, 52);
near('いちばん出にくい札', minP, 1 / 52, 0.0025);
near('いちばん出やすい札', maxP, 1 / 52, 0.0025);


/* ===== 3. 山札 ============================================ */
console.log('【3】山札');

const shoe = new R.Shoe();
check('最初は52枚', shoe.left, 52);

const c1 = shoe.draw();
check('1枚引くと51枚', shoe.left, 51);
check('引いた札は山にない',
    shoe.cards.filter(function (c) { return c.rank === c1.rank && c.suit === c1.suit; }).length, 0);

// 場の札を除いて組み直すと51枚になる
shoe.reset(c1);
check('場の札を抜いて組み直すと51枚', shoe.left, 51);
check('場の札は山に入っていない',
    shoe.cards.filter(function (c) { return c.rank === c1.rank && c.suit === c1.suit; }).length, 0);

// 数字ごとの残り枚数の合計が、残り枚数と一致するか
const counts = shoe.countsByRank();
let sumCounts = 0;
for (let r = 1; r <= 13; r++) sumCounts += counts[r];
check('数字ごとの残りを足すと残り枚数', sumCounts, shoe.left);
check('場の札の数字は1枚減っている', counts[c1.rank], 3);

// 52枚引き切れるか
const shoe2 = new R.Shoe();
for (let i = 0; i < 52; i++) shoe2.draw();
check('52枚引き切れる', shoe2.left, 0);
check('空の山から引くと undefined', shoe2.draw(), undefined);


/* ===== 4. 確率の計算 ====================================== */
console.log('【4】確率');

// 52枚からAを1枚抜いた51枚が残っている状態
const full = R.buildDeck();
const restAfterAce = full.filter(function (c) {
    return !(c.rank === 1 && c.suit === 's');
});
check('残りは51枚', restAfterAce.length, 51);

const ch = R.chances(1, restAfterAce);   // 場の札が A のとき
check('Aより上は48枚', ch.high.count, 48);
check('Aより下は0枚', ch.low.count, 0);
check('Aと同じは3枚', ch.same.count, 3);
check('合計は51枚', ch.high.count + ch.low.count + ch.same.count, 51);
check('Aでローは選べない', ch.low.possible, false);
check('ローの倍率は0', ch.low.mult, 0);

// 場の札が K のとき
const restAfterKing = full.filter(function (c) {
    return !(c.rank === 13 && c.suit === 's');
});
const chK = R.chances(13, restAfterKing);
check('Kより上は0枚', chK.high.count, 0);
check('Kより下は48枚', chK.low.count, 48);
check('Kでハイは選べない', chK.high.possible, false);

// 場の札が 7 のとき（ちょうど真ん中）
const restAfter7 = full.filter(function (c) {
    return !(c.rank === 7 && c.suit === 's');
});
const ch7 = R.chances(7, restAfter7);
check('7より上は24枚', ch7.high.count, 24);   // 8〜K の6種類 × 4枚
check('7より下は24枚', ch7.low.count, 24);    // A〜6 の6種類 × 4枚
check('7と同じは3枚', ch7.same.count, 3);
near('ハイの確率', ch7.high.prob, 24 / 51, 0.0001);

// 3つの確率を足すと必ず1になるか、全部の数字で確かめる
let probOk = true;
for (let r = 1; r <= 13; r++) {
    const rest = full.filter(function (c) { return !(c.rank === r && c.suit === 's'); });
    const x = R.chances(r, rest);
    const sum = x.high.prob + x.low.prob + x.same.prob;
    if (Math.abs(sum - 1) > 1e-9) probOk = false;
}
check('どの札でも確率の合計は1', probOk, true);


/* ===== 5. 倍率の計算 ====================================== */
console.log('【5】倍率');

// 確率の逆数 × 0.97 を、小数2桁で切り捨て
check('半分の確率なら 1.94倍', R.multiplierFor(1, 2), 1.94);
check('4回に1回なら 3.88倍', R.multiplierFor(1, 4), 3.88);
check('51回に1回なら 49.47倍', R.multiplierFor(1, 51), Math.floor(0.97 * 51 * 100) / 100);
check('0枚なら0倍', R.multiplierFor(0, 51), 0);
check('必ず当たるときも1.01倍は付く', R.multiplierFor(51, 51), 1.01);

// 7のときのハイ：24/51 → 0.97 × 51 ÷ 24 = 2.06倍
check('7からハイは2.06倍', ch7.high.mult, 2.06);
check('7から同じは16.49倍', ch7.same.mult, Math.floor(0.97 * 51 / 3 * 100) / 100);

// 倍率が必ず1より大きいか（当てたのに減ることがないか）
let multOk = true;
for (let r = 1; r <= 13; r++) {
    const rest = full.filter(function (c) { return !(c.rank === r && c.suit === 's'); });
    const x = R.chances(r, rest);
    ['high', 'low', 'same'].forEach(function (k) {
        if (x[k].possible && x[k].mult <= 1) multOk = false;
    });
}
check('当てて減ることはない', multOk, true);


/* ===== 6. 勝ち負けの判定 ================================== */
console.log('【6】勝ち負け');

check('7のあと9ならハイは当たり', R.judge('high', 7, 9), true);
check('7のあと9ならローは外れ', R.judge('low', 7, 9), false);
check('7のあと9なら同じは外れ', R.judge('same', 7, 9), false);
check('7のあと7なら同じは当たり', R.judge('same', 7, 7), true);
check('7のあと7ならハイは外れ', R.judge('high', 7, 7), false);
check('7のあと7ならローも外れ', R.judge('low', 7, 7), false);
check('Aのあと2ならハイは当たり', R.judge('high', 1, 2), true);
check('Kのあと Q ならローは当たり', R.judge('low', 13, 12), true);

// 3つのうち必ず1つだけが当たりになるか、全組み合わせで確かめる
let exactlyOne = true;
for (let a = 1; a <= 13; a++) {
    for (let b = 1; b <= 13; b++) {
        const n = ['high', 'low', 'same'].filter(function (g) {
            return R.judge(g, a, b);
        }).length;
        if (n !== 1) exactlyOne = false;
    }
}
check('どの組み合わせでも当たりは1つだけ', exactlyOne, true);


/* ===== 7. 100万回まわして還元率を確かめる ================= */
console.log('【7】還元率のシミュレーション');

function simulate(pick, rounds) {
    let staked = 0, returned = 0;
    const shoe = new R.Shoe();
    let current = shoe.draw();

    for (let i = 0; i < rounds; i++) {
        if (shoe.left < 8) { shoe.reset(current); }

        const ch = R.chances(current.rank, shoe.cards);
        const guess = pick(ch);
        if (!guess) { current = shoe.draw(); continue; }

        staked += 1;
        const next = shoe.draw();
        if (R.judge(guess, current.rank, next.rank)) {
            returned += ch[guess].mult;
        }
        current = next;
    }
    return returned / staked;
}

const ROUNDS = 300000;

// 確率の高いほうを選び続ける人
const rtpSafe = simulate(function (ch) {
    if (!ch.high.possible) return 'low';
    if (!ch.low.possible) return 'high';
    return ch.high.count >= ch.low.count ? 'high' : 'low';
}, ROUNDS);

// 確率の低いほうを選び続ける人
const rtpRisky = simulate(function (ch) {
    if (!ch.high.possible) return 'low';
    if (!ch.low.possible) return 'high';
    return ch.high.count < ch.low.count ? 'high' : 'low';
}, ROUNDS);

// 「同じ」だけを狙い続ける人
const rtpSame = simulate(function (ch) {
    return ch.same.possible ? 'same' : null;
}, ROUNDS);

console.log('      手堅く選ぶ  ' + (rtpSafe * 100).toFixed(2) + '%');
console.log('      冒険して選ぶ ' + (rtpRisky * 100).toFixed(2) + '%');
console.log('      同じ狙い    ' + (rtpSame * 100).toFixed(2) + '%');
console.log('      （どれを選んでも 97% 前後。切り捨てのぶん少し下がります）');

// どの選び方でも 97% 前後に収まるはず
near('手堅く選んだ還元率', rtpSafe, 0.97, 0.02);
near('冒険した還元率', rtpRisky, 0.97, 0.03);
near('同じ狙いの還元率', rtpSame, 0.97, 0.06);

// 選び方で還元率が大きく変わらないこと（＝どこに賭けても公平）
check('選び方で還元率が大きく変わらない', Math.abs(rtpSafe - rtpRisky) < 0.03, true);


/* ===== 8. 連勝したときの倍率の積み上がり ================== */
console.log('【8】連勝の積み上がり');

// 2.06倍を5回続けたら 2.06^5 ≒ 37.1倍
let m = 1;
for (let i = 0; i < 5; i++) m *= 2.06;
near('2.06倍を5連勝すると約37倍', m, 37.1, 0.2);

// 1,000円を5連勝させると約37,000円
near('1000円が5連勝で約37,000円', Math.floor(1000 * m), 37115, 300);


/* ===== まとめ ============================================= */
console.log('\n========================================');
console.log('  通った: ' + pass + '   落ちた: ' + fail);
console.log('========================================\n');

if (fail > 0) process.exit(1);
