'use strict';
/* ============================================================
   rules.js ─ トランプと、確率・倍率の計算だけを書いたファイル

   画面のことは一切知りません。
   「いまの札」と「山に残っている札」を渡すと、
   「ハイ・ロー・同じ、それぞれの確率と倍率」を返します。

   このゲームの肝は、倍率を決め打ちにしないところです。
   残り札から確率を出して、そこから倍率を計算します。
   だから札が減るほど倍率が動きます。
   ============================================================ */


/* ------------------------------------------------------------
   カードの決まりごと
   ------------------------------------------------------------ */

// マーク。s=スペード h=ハート d=ダイヤ c=クラブ
const SUITS = ['s', 'h', 'd', 'c'];

const SUIT_MARK = { s: '♠', h: '♥', d: '♦', c: '♣' };

// 赤いマークかどうか
function isRed(suit) {
    return suit === 'h' || suit === 'd';
}

// 数字の表示。1はA、11〜13はJ・Q・K
function rankLabel(rank) {
    if (rank === 1) return 'A';
    if (rank === 11) return 'J';
    if (rank === 12) return 'Q';
    if (rank === 13) return 'K';
    return String(rank);
}

// Aがいちばん小さく、Kがいちばん大きい、という並びです。
const RANK_MIN = 1;
const RANK_MAX = 13;

// カジノの取り分。3%です。
// 倍率は「確率の逆数 × 0.97」で決めています。
const HOUSE_EDGE = 0.03;


/* ------------------------------------------------------------
   かたよりのない乱数

   Math.random() でも遊べますが、トランプを混ぜる処理なので
   暗号用の乱数（crypto）を使います。

   「0〜4294967295 の数を 52 で割った余り」をそのまま使うと、
   割り切れないぶんだけ特定の札が出やすくなります。
   そこで、割り切れない端の値が出たら捨てて引き直します。
   ------------------------------------------------------------ */
function randomInt(max) {
    const g = (typeof crypto !== 'undefined' && crypto.getRandomValues) ? crypto : null;
    if (!g) return Math.floor(Math.random() * max);   // 念のための逃げ道

    const RANGE = 4294967296;              // 2の32乗
    const limit = RANGE - (RANGE % max);   // ここ以上の値は捨てる
    const buf = new Uint32Array(1);
    let v;
    do {
        g.getRandomValues(buf);
        v = buf[0];
    } while (v >= limit);

    return v % max;
}


/* ------------------------------------------------------------
   シャッフル（フィッシャー・イェーツ法）

   後ろから順に「そこまでの中の誰か」と入れ替えていきます。
   どの並び順も同じ確率で出る、という性質が証明されている方法です。

   よくある sort(() => Math.random() - 0.5) は、
   見た目は混ざりますが並び方にかたよりが出ます。
   ------------------------------------------------------------ */
function shuffleInPlace(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
        const j = randomInt(i + 1);
        const tmp = arr[i];
        arr[i] = arr[j];
        arr[j] = tmp;
    }
    return arr;
}


/* ------------------------------------------------------------
   52枚ひと組を作る
   ------------------------------------------------------------ */
function buildDeck() {
    const deck = [];
    for (let s = 0; s < SUITS.length; s++) {
        for (let r = RANK_MIN; r <= RANK_MAX; r++) {
            deck.push({ rank: r, suit: SUITS[s] });
        }
    }
    return deck;
}


/* ============================================================
   山札（シュー）

   引いた札は戻しません。だから確率が動きます。
   残りが少なくなったら、新しいひと組に入れ替えます。
   ============================================================ */
class Shoe {

    constructor() {
        this.cards = [];
        this.reset(null);
    }

    /* 新しいひと組にする
       exclude … いま場に出ている札。山から取り除いておきます
                 （同じ札が2枚あることになってしまうため） */
    reset(exclude) {
        let deck = buildDeck();

        if (exclude) {
            const i = deck.findIndex(function (c) {
                return c.rank === exclude.rank && c.suit === exclude.suit;
            });
            if (i >= 0) deck.splice(i, 1);
        }

        this.cards = shuffleInPlace(deck);
    }

    /* 1枚引く（山の一番上から） */
    draw() {
        return this.cards.pop();
    }

    /* 残り枚数 */
    get left() {
        return this.cards.length;
    }

    /* 数字ごとの残り枚数を数える
       → { 1: 4, 2: 3, ... 13: 4 } の形で返します */
    countsByRank() {
        const counts = {};
        for (let r = RANK_MIN; r <= RANK_MAX; r++) counts[r] = 0;
        this.cards.forEach(function (c) { counts[c.rank]++; });
        return counts;
    }
}


/* ------------------------------------------------------------
   倍率の計算

   確率が p のことを当てたら、公平な倍率は 1 ÷ p です。
   （5回に1回しか起きないことなら5倍、という考え方）
   そこからカジノの取り分3%を引いて、小数2桁で切り捨てます。

   切り捨てにしているのは、
   払いすぎる側に誤差が出ないようにするためです。
   ------------------------------------------------------------ */
function multiplierFor(count, total) {
    if (count <= 0 || total <= 0) return 0;

    const p = count / total;
    const raw = (1 - HOUSE_EDGE) / p;
    const cut = Math.floor(raw * 100) / 100;

    // 残り札のかたよりで1.00を割ることがまれにあります。
    // 当てたのに減るのはおかしいので、1.01を下限にします。
    return Math.max(1.01, cut);
}


/* ------------------------------------------------------------
   いまの札に対する「ハイ・ロー・同じ」の見通し

   currentRank … いま場に出ている札の数字
   remaining   … 山に残っている札の配列

   3つは重なりません。必ずどれか1つが起きます。
   ------------------------------------------------------------ */
function chances(currentRank, remaining) {
    let high = 0, low = 0, same = 0;

    for (let i = 0; i < remaining.length; i++) {
        const r = remaining[i].rank;
        if (r > currentRank) high++;
        else if (r < currentRank) low++;
        else same++;
    }

    const total = remaining.length;

    function make(count) {
        return {
            count: count,
            prob: total > 0 ? count / total : 0,
            mult: multiplierFor(count, total),
            possible: count > 0
        };
    }

    return {
        total: total,
        high: make(high),
        low: make(low),
        same: make(same)
    };
}


/* ------------------------------------------------------------
   勝ち負けの判定

   guess … 'high' / 'low' / 'same'
   戻り値 … true なら当たり
   ------------------------------------------------------------ */
function judge(guess, currentRank, nextRank) {
    if (guess === 'high') return nextRank > currentRank;
    if (guess === 'low') return nextRank < currentRank;
    if (guess === 'same') return nextRank === currentRank;
    return false;
}


/* ------------------------------------------------------------
   まとめて公開
   ------------------------------------------------------------ */
const Rules = {
    SUITS: SUITS,
    SUIT_MARK: SUIT_MARK,
    RANK_MIN: RANK_MIN,
    RANK_MAX: RANK_MAX,
    HOUSE_EDGE: HOUSE_EDGE,
    isRed: isRed,
    rankLabel: rankLabel,
    buildDeck: buildDeck,
    shuffleInPlace: shuffleInPlace,
    randomInt: randomInt,
    Shoe: Shoe,
    chances: chances,
    judge: judge,
    multiplierFor: multiplierFor
};

if (typeof module !== 'undefined' && module.exports) {
    module.exports = Rules;
}
if (typeof window !== 'undefined') {
    window.Rules = Rules;
}
