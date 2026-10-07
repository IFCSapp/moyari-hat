/**
 * モヤリハット - アプリケーションロジック (UX改善、エクスポート機能強化、フローティングナビ拡張)
 */

/* ========================================
   1. 定数とlocalStorageキー
======================================== */
const STORAGE_KEY = 'MOYARIHAT_STATE_V1';
const APP_SCHEMA_VERSION = 3; // バージョン3を維持
const APP_VERSION = '1.4.0';
const LAST_SEEN_APP_VERSION_KEY = 'MOYARIHAT_LAST_SEEN_APP_VERSION';
const CURRENT_DRAFT_STORAGE_KEY = 'MOYARIHAT_CURRENT_DRAFT_V1:';
const CURRENT_DRAFT_SCHEMA_VERSION = 1;
let currentDraftId = null;
let currentDraftTimer = null;
let storageAvailable = true;
let recoveryNotice = null;
let recoveryRequired = false;
let storageReadDenied = false;
let lastPersistedState = null;
let currentDraftSourceId = null;
let currentDraftSourceUpdatedAt = null;
let recoveryRaw = null;
let persistedRaw = null;

const CHANGELOG = [
    {
        version: '1.4.0',
        date: '2026-10-07',
        items: [
            '入力途中の内容を端末内に自動保存し、続きから再開できるようにしました。',
            '途中で休むボタンと下書きの削除を追加しました。',
            '保存に失敗した場合は入力を残し、再試行できるようにしました。',
            '保存データの読み込みに失敗した場合は、元データを上書きせず保持します。',
            '各画面の現在位置と選択数を表示し、身体部位の選択・削除を分けました。'
        ]
    },
    {
        version: '1.3.0',
        date: '2026-04-27',
        items: [
            '設定画面を追加しました。',
            'アプリ情報を確認できるようにしました。',
            '復元用バックアップの書き出しと読み込みに対応しました.',
            '保存済み記録と項目設定の初期化を分けました。',
            'すべて初期化に二段階確認を追加しました。',
            '初回ガイドをもう一度表示できるようにしました。',
            '診断情報をコピーできるようにしました。',
            'アプリの再読み込みとキャッシュ削除に対応しました。',
            '保存データが壊れた場合に退避するようにしました。',
            '古いデータ形式を読み込んでも記録を消さないようにしました。',
            '相談用コピー機能を追加しました'
        ]
    }
];

// アプリの初期状態構造
const INITIAL_STATE = {
    schemaVersion: APP_SCHEMA_VERSION,
    hasSeenGuide: false,
    items: [], // 項目データ（デフォルト＋追加）
    records: [], // 記録データ
    lastSavedAt: null,
};

// 作成中の一時記録データ構造
const INITIAL_CURRENT_RECORD = {
    behaviorSigns: [],
    selectedOrder: [], // Step2で選んだ順番('external', 'mind', 'body')
    externalFactors: [],
    mindNotifications: [],
    body: {
        entries: [] // { partId: string, sensations: [{itemId, strength}] }
    },
    moyariLevel: 0,
    nextActions: []
};

let appState = null;
let currentRecord = JSON.parse(JSON.stringify(INITIAL_CURRENT_RECORD));
let currentDetailRecord = null; // 詳細表示中のレコード
let currentAddItemContext = null; // 項目追加モーダルの一時状態
let currentBodyPartId = null; // 身体感覚で現在選択されている部位
let selectedExportRecordIds = new Set(); // 選択エクスポート用
let recordListFilter = {
    keyword: '',
    minLevel: 'all',
    sort: 'newest'
};
let pendingRestoreData = null; // バックアップ復元用

/* ========================================
   2. デフォルト項目データ
======================================== */
// デフォルトの項目データを生成する関数
function createDefaultItems() {
    const items = [];
    const now = new Date().toISOString();

    // 項目追加用ヘルパー
    const addItems = (category, group, itemsList) => {
        itemsList.forEach(item => {
            items.push({
                id: item.id,
                category: category,
                group: group,
                label: item.label,
                appliesToParts: item.appliesToParts || null,
                isDefault: true,
                isHidden: false,
                createdAt: now,
                useCount: 0,
                lastUsedAt: null
            });
        });
    };

    // --- 行動のサイン (behavior) ---
    addItems('behavior', '止まる', [
        { id: 'behavior_stop_screen', label: '画面を見たまま止まっている' },
        { id: 'behavior_stop_hands', label: '手が動かない' },
        { id: 'behavior_stop_decide', label: '何から始めるか決められない' },
        { id: 'behavior_stop_input', label: '入力欄を開いたまま止まっている' },
        { id: 'behavior_stop_read', label: '同じところを何度も読んでいる' }
    ]);
    addItems('behavior', '避ける', [
        { id: 'behavior_avoid_work', label: '別の作業を始めている' },
        { id: 'behavior_avoid_smartphone', label: 'スマホを見たくなる' },
        { id: 'behavior_avoid_postpone', label: '後回しにしている' },
        { id: 'behavior_avoid_ignore', label: '連絡や通知を見ないようにしている' },
        { id: 'behavior_avoid_leave', label: '席を立ちたくなる' }
    ]);
    addItems('behavior', '焦る', [
        { id: 'behavior_hurry_rush', label: '急いで進めようとしている' },
        { id: 'behavior_hurry_nocheck', label: '確認せずに進めそうになっている' },
        { id: 'behavior_hurry_redo', label: '何度もやり直している' },
        { id: 'behavior_hurry_fearmiss', label: 'ミスが怖くて確認が増えている' },
        { id: 'behavior_hurry_worryothers', label: '人の様子が気になっている' }
    ]);
    addItems('behavior', '相談しづらい', [
        { id: 'behavior_consult_swallow', label: '質問を飲み込んでいる' },
        { id: 'behavior_consult_misstiming', label: '声をかけるタイミングを逃している' },
        { id: 'behavior_consult_notorganized', label: '相談内容がまとまらない' },
        { id: 'behavior_consult_stopmemo', label: 'メモを書こうとして止まっている' },
        { id: 'behavior_consult_later', label: '「あとで聞こう」と思っている' }
    ]);
    addItems('behavior', '離れたくなる', [
        { id: 'behavior_leave_gohome', label: '帰りたくなっている' },
        { id: 'behavior_leave_rest', label: '休みたくなっている' },
        { id: 'behavior_leave_impossible', label: '今日は無理だと思っている' },
        { id: 'behavior_leave_donothing', label: '何もしたくない感じがある' },
        { id: 'behavior_leave_changeplan', label: '予定を変えたくなっている' }
    ]);
    addItems('behavior', 'その他', [
        { id: 'behavior_other_none', label: '近いものがない' },
        { id: 'behavior_other_unknown', label: 'よく分からない' }
    ]);

    // --- 外的要因 (external) ---
    addItems('external', '環境', [
        { id: 'external_env_noise', label: '周囲の音が気になる' },
        { id: 'external_env_people', label: '人の動きが気になる' },
        { id: 'external_env_seat', label: '席の位置が落ち着かない' },
        { id: 'external_env_light', label: '明るさが合わない' },
        { id: 'external_env_temp', label: '暑い・寒い' },
        { id: 'external_env_smell', label: 'においが気になる' },
        { id: 'external_env_crowd', label: '周りが混んでいる' }
    ]);
    addItems('external', '情報', [
        { id: 'external_info_toomuch', label: '説明が多い' },
        { id: 'external_info_vague', label: '説明があいまい' },
        { id: 'external_info_startunknown', label: '何から始めるか分からない' },
        { id: 'external_info_noprocedure', label: '手順が見えない' },
        { id: 'external_info_heavy', label: '画面や資料の情報量が多い' },
        { id: 'external_info_nopriority', label: '期限や優先順位が分かりにくい' }
    ]);
    addItems('external', '対人', [
        { id: 'external_person_busy', label: '声をかける相手が忙しそう' },
        { id: 'external_person_timing', label: '質問するタイミングが分からない' },
        { id: 'external_person_near', label: '近くに人がいて気になる' },
        { id: 'external_person_watched', label: '見られている感じがする' },
        { id: 'external_person_rememberscold', label: '前に注意されたことを思い出す' }
    ]);
    addItems('external', '時間', [
        { id: 'external_time_short', label: '時間が足りない感じがする' },
        { id: 'external_time_deadline', label: '締切が近い' },
        { id: 'external_time_planchanged', label: '予定が変わった' },
        { id: 'external_time_next', label: '次の予定が気になる' },
        { id: 'external_time_catchup', label: '遅れを取り戻そうとしている' }
    ]);
    addItems('external', '体調・生活', [
        { id: 'external_health_sleep', label: '睡眠不足' },
        { id: 'external_health_hungry', label: '空腹' },
        { id: 'external_health_tired', label: '疲れがある' },
        { id: 'external_health_medicine', label: '薬の影響が気になる' },
        { id: 'external_health_unusual', label: '体調がいつもと違う' },
        { id: 'external_health_morning', label: '朝から動き出しにくい' }
    ]);
    addItems('external', '道具・作業条件', [
        { id: 'external_tool_pcslow', label: 'PCの動作が重い' },
        { id: 'external_tool_hardinput', label: '入力しづらい' },
        { id: 'external_tool_filelost', label: 'ファイルの場所が分からない' },
        { id: 'external_tool_wifi', label: 'Wi-Fiや通信が不安定' },
        { id: 'external_tool_appunknown', label: '使うアプリが分からない' },
        { id: 'external_tool_place', label: '作業場所が合わない' }
    ]);

    // --- 頭の中の通知 (mind) ---
    addItems('mind', 'できない系', [
        { id: 'mind_cant_impossible', label: 'どうせ無理' },
        { id: 'mind_cant_feeling', label: 'できる気がしない' },
        { id: 'mind_cant_failagain', label: 'また失敗する' },
        { id: 'mind_cant_notfit', label: '自分には向いていない' },
        { id: 'mind_cant_toolate', label: 'もう遅い' }
    ]);
    addItems('mind', 'ちゃんとしないと系', [
        { id: 'mind_must_proper', label: 'ちゃんとしないと' },
        { id: 'mind_must_hurry', label: '早くしないと' },
        { id: 'mind_must_perfect', label: '完璧にやらないと' },
        { id: 'mind_must_nomistake', label: '間違えてはいけない' },
        { id: 'mind_must_nobother', label: '迷惑をかけてはいけない' }
    ]);
    addItems('mind', '人の目系', [
        { id: 'mind_eye_weird', label: '変に思われる' },
        { id: 'mind_eye_scold', label: '怒られるかもしれない' },
        { id: 'mind_eye_bother', label: '聞いたら迷惑かもしれない' },
        { id: 'mind_eye_incompetent', label: 'できない人だと思われる' },
        { id: 'mind_eye_hardtosay', label: '今さら言いづらい' }
    ]);
    addItems('mind', '先延ばし系', [
        { id: 'mind_postpone_later', label: 'あとでやればいい' },
        { id: 'mind_postpone_nowimpossible', label: '今は無理' },
        { id: 'mind_postpone_calmdown', label: 'もう少し落ち着いてから' },
        { id: 'mind_postpone_stoptoday', label: '今日はやめておこう' },
        { id: 'mind_postpone_ignore', label: '見なかったことにしたい' }
    ]);
    addItems('mind', '自己批判系', [
        { id: 'mind_blame_bad', label: '自分はだめだ' },
        { id: 'mind_blame_again', label: 'また同じことをしている' },
        { id: 'mind_blame_why', label: 'なんでできないんだろう' },
        { id: 'mind_blame_more', label: 'もっと頑張らないと' },
        { id: 'mind_blame_sweet', label: '甘えているのではないか' }
    ]);
    addItems('mind', '不明・その他', [
        { id: 'mind_other_wordless', label: 'うまく言葉にできない' },
        { id: 'mind_other_none', label: '近いものがない' },
        { id: 'mind_other_unknown', label: 'よく分からない' }
    ]);

    // --- 身体部位 (bodyPart) ---
    addItems('bodyPart', '部位', [
        { id: 'body_part_head', label: '頭' },
        { id: 'body_part_eye', label: '目' },
        { id: 'body_part_face', label: '顔' },
        { id: 'body_part_mouth', label: '口・あご' },
        { id: 'body_part_neck', label: '首' },
        { id: 'body_part_shoulder', label: '肩' },
        { id: 'body_part_chest', label: '胸' },
        { id: 'body_part_stomach', label: 'お腹' },
        { id: 'body_part_back', label: '背中' },
        { id: 'body_part_waist', label: '腰' },
        { id: 'body_part_arm', label: '腕' },
        { id: 'body_part_hand', label: '手' },
        { id: 'body_part_leg', label: '足' },
        { id: 'body_part_whole', label: '全身' },
        { id: 'body_part_unclear', label: 'はっきりしない' }
    ]);

    // --- 身体感覚 (bodySensation) ---
    addItems('bodySensation', '力が入る系', [
        { id: 'body_sensation_stiff', label: 'こわばる' },
        { id: 'body_sensation_freeze', label: '固まる' },
        { id: 'body_sensation_tight', label: 'ぎゅっとなる' },
        { id: 'body_sensation_tension', label: '張っている' },
        { id: 'body_sensation_stuck', label: '抜けない' },
        { id: 'body_sensation_shake', label: '震える' }
    ]);
    addItems('bodySensation', '重さ・だるさ系', [
        { id: 'body_sensation_heavy', label: '重い' },
        { id: 'body_sensation_dull', label: 'だるい' },
        { id: 'body_sensation_sleepy', label: '眠い' },
        { id: 'body_sensation_hardmove', label: '動きにくい' },
        { id: 'body_sensation_sink', label: '沈む感じ' },
        { id: 'body_sensation_blunt', label: '鈍い感じ' }
    ]);
    addItems('bodySensation', 'ざわざわ系', [
        { id: 'body_sensation_noise_zawa', label: 'ざわざわする' },
        { id: 'body_sensation_noise_sowa', label: 'そわそわする' },
        { id: 'body_sensation_noise_restless', label: '落ち着かない' },
        { id: 'body_sensation_noise_hurried', label: '急かされる感じ' },
        { id: 'body_sensation_noise_inner', label: '内側が騒がしい' },
        { id: 'body_sensation_noise_hardstay', label: 'じっとしていづらい' }
    ]);
    addItems('bodySensation', '熱・冷え系', [
        { id: 'body_sensation_temp_hot', label: '熱っぽい' },
        { id: 'body_sensation_temp_cold', label: '冷たい', appliesToParts: ['body_part_hand', 'body_part_leg', 'body_part_arm', 'body_part_whole', 'body_part_unclear'] },
        { id: 'body_sensation_temp_sweat', label: '汗ばむ' },
        { id: 'body_sensation_temp_facehot', label: 'ほてる', appliesToParts: ['body_part_face', 'body_part_head', 'body_part_whole', 'body_part_unclear'] },
        { id: 'body_sensation_temp_limbcold', label: '冷えている', appliesToParts: ['body_part_hand', 'body_part_leg', 'body_part_arm', 'body_part_whole', 'body_part_unclear'] }
    ]);
    addItems('bodySensation', '息・胸まわり', [
        { id: 'body_sensation_breath_shallow', label: '息が浅い', appliesToParts: ['body_part_chest', 'body_part_neck', 'body_part_whole', 'body_part_unclear'] },
        { id: 'body_sensation_breath_chesttight', label: '圧迫される感じ', appliesToParts: ['body_part_chest', 'body_part_whole', 'body_part_unclear'] },
        { id: 'body_sensation_breath_chestheavy', label: '重く乗る感じ', appliesToParts: ['body_part_chest', 'body_part_whole', 'body_part_unclear'] },
        { id: 'body_sensation_breath_throat', label: '飲み込みにくい感じ', appliesToParts: ['body_part_neck', 'body_part_mouth', 'body_part_whole', 'body_part_unclear'] },
        { id: 'body_sensation_breath_hard', label: '呼吸しづらい感じ', appliesToParts: ['body_part_chest', 'body_part_neck', 'body_part_mouth', 'body_part_whole', 'body_part_unclear'] }
    ]);
    addItems('bodySensation', '感覚が薄い系', [
        { id: 'body_sensation_faint_blur', label: 'ぼんやりする', appliesToParts: ['body_part_head', 'body_part_eye', 'body_part_whole', 'body_part_unclear'] },
        { id: 'body_sensation_faint_far', label: '遠い感じ' },
        { id: 'body_sensation_faint_unreal', label: '実感が薄い' },
        { id: 'body_sensation_faint_white', label: '真っ白になる感じ', appliesToParts: ['body_part_head', 'body_part_whole', 'body_part_unclear'] },
        { id: 'body_sensation_faint_nothing', label: '何も感じない感じ' }
    ]);
    addItems('bodySensation', '痛み・不快感', [
        { id: 'body_sensation_pain_pain', label: '痛い' },
        { id: 'body_sensation_pain_muzu', label: 'ムズムズする' },
        { id: 'body_sensation_pain_chiku', label: 'チクチクする' },
        { id: 'body_sensation_pain_numb', label: 'しびれる' },
        { id: 'body_sensation_pain_sick', label: '気持ち悪い' }
    ]);
    addItems('bodySensation', '不明・その他', [
        { id: 'body_sensation_other_unknown', label: 'よく分からない' },
        { id: 'body_sensation_other_none', label: '近いものがない' }
    ]);

    // --- 次の一手 (action) ---
    addItems('action', '作業を小さくする', [
        { id: 'action_small_read', label: '最初の1行だけ読む' },
        { id: 'action_small_open', label: 'ファイルを開くだけにする' },
        { id: 'action_small_mark', label: '分からないところに印をつける' },
        { id: 'action_small_3min', label: '3分だけ触る' },
        { id: 'action_small_oneinput', label: '一つだけ入力する' },
        { id: 'action_small_onerange', label: '今やる範囲を一つにする' }
    ]);
    addItems('action', '体を整える', [
        { id: 'action_body_water', label: '水を飲む' },
        { id: 'action_body_rest', label: '3分だけ休む' },
        { id: 'action_body_breath', label: '深呼吸を3回する' },
        { id: 'action_body_relax', label: '肩の力を抜く' },
        { id: 'action_body_leave', label: '席を少し離れる' },
        { id: 'action_body_posture', label: '姿勢を変える' }
    ]);
    addItems('action', '環境を変える', [
        { id: 'action_env_seat', label: '席を変える' },
        { id: 'action_env_sound', label: '音を減らす' },
        { id: 'action_env_close', label: '画面を閉じすぎないように整理する' },
        { id: 'action_env_file', label: '必要なファイルだけ開く' },
        { id: 'action_env_material', label: '資料を一つだけにする' }
    ]);
    addItems('action', '相談する', [
        { id: 'action_consult_stop', label: '職員に「少し止まっています」と伝える' },
        { id: 'action_consult_start', label: '「最初にどこから始めればよいですか」と聞く' },
        { id: 'action_consult_show', label: '画面を見せる' },
        { id: 'action_consult_write', label: '質問を一文で書く' },
        { id: 'action_consult_memo', label: 'メモを見せる' },
        { id: 'action_consult_only', label: '今は相談だけにする' }
    ]);
    addItems('action', '連絡する', [
        { id: 'action_contact_one', label: '一文だけ送る' },
        { id: 'action_contact_arrive', label: '到着予定だけ伝える' },
        { id: 'action_contact_status', label: '今の状態だけ伝える' },
        { id: 'action_contact_draft', label: '返信文の下書きだけ作る' }
    ]);
    addItems('action', '切り替える', [
        { id: 'action_switch_other', label: '別の小さい作業に切り替える' },
        { id: 'action_switch_check', label: '今日は確認だけにする' },
        { id: 'action_switch_priority', label: '優先順位を一つだけ確認する' },
        { id: 'action_switch_next', label: '二手目を決める' }
    ]);
    addItems('action', 'その他', [
        { id: 'action_other_none', label: '近いものがない' },
        { id: 'action_other_later', label: 'あとで決める' }
    ]);

    return items;
}

/* ========================================
   3. localStorageの読み込み・保存
======================================== */
function normalizeState(state) {
    if (!state || typeof state !== 'object') {
        const freshState = JSON.parse(JSON.stringify(INITIAL_STATE));
        freshState.items = createDefaultItems();
        return freshState;
    }

    if (typeof state.schemaVersion !== 'number') {
        state.schemaVersion = 1;
    }

    if (typeof state.hasSeenGuide !== 'boolean') {
        state.hasSeenGuide = false;
    }

    if (!Array.isArray(state.items)) {
        state.items = [];
    }

    if (!Array.isArray(state.records)) {
        state.records = [];
    }

    if (!('lastSavedAt' in state)) {
        state.lastSavedAt = null;
    }

    if (state.items.length === 0) {
        state.items = createDefaultItems();
    }

    state.records = state.records.map(record => {
        const normalizedRecord = record && typeof record === 'object'
            ? record
            : {};

        if (!normalizedRecord.id) {
            normalizedRecord.id = `record_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        }

        if (!normalizedRecord.createdAt) {
            normalizedRecord.createdAt = new Date().toISOString();
        }

        if (!Array.isArray(normalizedRecord.behaviorSigns)) {
            normalizedRecord.behaviorSigns = [];
        }

        if (!Array.isArray(normalizedRecord.selectedOrder)) {
            normalizedRecord.selectedOrder = [];
        }

        if (!Array.isArray(normalizedRecord.externalFactors)) {
            normalizedRecord.externalFactors = [];
        }

        if (!Array.isArray(normalizedRecord.mindNotifications)) {
            normalizedRecord.mindNotifications = [];
        }

        if (!normalizedRecord.body || typeof normalizedRecord.body !== 'object') {
            normalizedRecord.body = { entries: [] };
        }

        if (!Array.isArray(normalizedRecord.body.entries)) {
            normalizedRecord.body.entries = [];
        }

        normalizedRecord.body.entries = normalizedRecord.body.entries.map(entry => {
            const normalizedEntry = entry && typeof entry === 'object'
                ? entry
                : {};

            if (!normalizedEntry.partId) {
                normalizedEntry.partId = 'body_part_unclear';
            }

            if (!Array.isArray(normalizedEntry.sensations)) {
                normalizedEntry.sensations = [];
            }

            return normalizedEntry;
        });

        if (typeof normalizedRecord.moyariLevel !== 'number') {
            normalizedRecord.moyariLevel = 0;
        }

        if (!Array.isArray(normalizedRecord.nextActions)) {
            normalizedRecord.nextActions = [];
        }

        if (typeof normalizedRecord.summaryText !== 'string') {
            normalizedRecord.summaryText = '';
        }

        if (!normalizedRecord.itemSnapshot || typeof normalizedRecord.itemSnapshot !== 'object') {
            normalizedRecord.itemSnapshot = {};
        }

        return normalizedRecord;
    });

    state.schemaVersion = APP_SCHEMA_VERSION;

    return state;
}

function loadState() {
    let stored = null;
    recoveryRequired = false;
    storageReadDenied = false;
    recoveryNotice = null;
    recoveryRaw = null;

    try {
        stored = localStorage.getItem(STORAGE_KEY);
        persistedRaw = stored;

        if (stored) {
            const parsed = JSON.parse(stored);
            if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.items) || !Array.isArray(parsed.records)) {
                throw new Error('保存データの形式が正しくありません');
            }
            const oldVersion = parsed.schemaVersion || 1;

            appState = normalizeState(parsed);
            lastPersistedState = JSON.parse(JSON.stringify(appState));

            let needsSave = false;

            if (oldVersion < APP_SCHEMA_VERSION) {
                needsSave = true;
            }

            if (appState.items.length === 0) {
                appState.items = createDefaultItems();
                needsSave = true;
            }

            // 既存のデフォルト項目に新しいappliesToPartsとラベルを反映させる
            const defaultItems = createDefaultItems();
            appState.items.forEach(item => {
                if (item.isDefault) {
                    const def = defaultItems.find(d => d.id === item.id);
                    if (def) {
                        if (def.appliesToParts && !item.appliesToParts) {
                            item.appliesToParts = def.appliesToParts;
                            needsSave = true;
                        }
                        const idsToUpdateLabel = [
                            'body_sensation_temp_hot',
                            'body_sensation_temp_facehot',
                            'body_sensation_temp_cold',
                            'body_sensation_temp_limbcold',
                            'body_sensation_breath_chesttight',
                            'body_sensation_breath_chestheavy',
                            'body_sensation_breath_throat',
                            'body_sensation_breath_hard',
                            'body_sensation_faint_blur',
                            'body_sensation_faint_white'
                        ];
                        if (idsToUpdateLabel.includes(item.id) && item.label !== def.label) {
                            item.label = def.label;
                            needsSave = true;
                        }
                    }
                }
            });

            if (needsSave) {
                saveState();
            }
        } else {
            appState = JSON.parse(JSON.stringify(INITIAL_STATE));
            appState.items = createDefaultItems();
            if (!saveState()) storageAvailable = false;
        }
    } catch (error) {
        console.error("状態の読み込みに失敗しました:", error);

        if (stored) {
            try {
                const timestamp = new Date()
                    .toISOString()
                    .replace(/[^\d]/g, '')
                    .slice(0, 14);

                const corruptedKey = `MOYARIHAT_STATE_CORRUPTED_${timestamp}`;
                localStorage.setItem(corruptedKey, stored);
                console.warn(`壊れた保存データを退避しました: ${corruptedKey}`);
            } catch (backupError) {
                console.warn("壊れた保存データの退避にも失敗しました:", backupError);
            }
            recoveryRequired = true;
            recoveryRaw = stored;
            recoveryNotice = '保存データが壊れている可能性があります。元データは変更せず保持しました。設定画面から先にバックアップを書き出し、内容を確認してから復元または初期化してください。';
        } else {
            storageReadDenied = true;
            recoveryNotice = '端末の保存領域を読み取れません。保存済みデータを空の状態で置き換えることはせず、この起動中は一時利用になります。';
        }

        appState = JSON.parse(JSON.stringify(INITIAL_STATE));
        appState.items = createDefaultItems();
        storageAvailable = false;
    }

    renderPersistenceNotice();
    renderCurrentDraftCandidates();
}

function saveState() {
    // Corrupt/read-denied recovery is a deliberate write barrier; quota errors are retryable.
    if (recoveryRequired || storageReadDenied) {
        if (lastPersistedState) appState = JSON.parse(JSON.stringify(lastPersistedState));
        renderPersistenceNotice();
        return false;
    }
    try {
        if (localStorage.getItem(STORAGE_KEY) !== persistedRaw) {
            throw new Error('別のタブで保存データが変わりました。下書きを残して再読み込みしてください。');
        }
        const nextState = { ...appState, lastSavedAt: new Date().toISOString() };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(nextState));
        persistedRaw = JSON.stringify(nextState);
        appState.lastSavedAt = nextState.lastSavedAt;
        lastPersistedState = JSON.parse(JSON.stringify(nextState));
        storageAvailable = true;
        if (!recoveryRequired) {
            recoveryNotice = null;
            renderPersistenceNotice();
        }
        return true;
    } catch (error) {
        console.error("状態の保存に失敗しました:", error);
        if (lastPersistedState) appState = JSON.parse(JSON.stringify(lastPersistedState));
        storageAvailable = false;
        renderPersistenceNotice(error.message?.startsWith('別のタブ') ? error.message : 'データを端末に保存できませんでした。入力は画面に残っています。保存領域を確保してから再試行してください。');
        return false;
    }
}

function renderPersistenceNotice(message = null) {
    if (message) recoveryNotice = message;
    const existing = document.getElementById('moyari-persistence-notice');
    if (!recoveryNotice && storageAvailable) {
        existing?.remove();
        return;
    }
    const notice = existing || document.createElement('div');
    notice.id = 'moyari-persistence-notice';
    notice.setAttribute('role', 'status');
    notice.setAttribute('aria-live', 'polite');
    notice.textContent = recoveryNotice || '端末への保存に失敗しました。入力は画面に残っています。保存領域を確保してから再試行してください。';
    if (!existing) document.body.prepend(notice);
}

function readCurrentDraftCandidates() {
    const drafts = [];
    try {
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (!key?.startsWith(CURRENT_DRAFT_STORAGE_KEY)) continue;
            try {
                const draft = JSON.parse(localStorage.getItem(key));
                if (draft?.schemaVersion === CURRENT_DRAFT_SCHEMA_VERSION && typeof draft.id === 'string' &&
                    draft.currentRecord && Array.isArray(draft.currentRecord.behaviorSigns) &&
                    Array.isArray(draft.currentRecord.externalFactors) && Array.isArray(draft.currentRecord.mindNotifications) &&
                    Array.isArray(draft.currentRecord.nextActions) && Array.isArray(draft.currentRecord.body?.entries)) drafts.push(draft);
            } catch (error) { console.warn('下書きの形式を確認できませんでした', error); }
        }
    } catch (error) { console.warn('下書きを読み込めませんでした:', error); }
    return drafts.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
}

function writeCurrentDraft(draft) {
    try {
        localStorage.setItem(CURRENT_DRAFT_STORAGE_KEY + draft.id, JSON.stringify(draft));
        return true;
    } catch (error) {
        console.warn('下書きを保存できませんでした:', error);
        renderPersistenceNotice('端末への下書き保存に失敗しました。現在の入力は画面に残っていますが、再読み込み前に保存領域を確保してください。');
        return false;
    }
}

function captureCurrentDraft() {
    return {
        schemaVersion: CURRENT_DRAFT_SCHEMA_VERSION,
        id: currentDraftId || `draft_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
        updatedAt: new Date().toISOString(),
        currentRecord: JSON.parse(JSON.stringify(currentRecord)),
        currentBodyPartId,
        viewId: document.querySelector('.view:not([hidden])')?.id || 'view-step1-behavior',
        selectedOrder: [...(currentRecord.selectedOrder || [])]
    };
}

function saveCurrentDraftNow() {
    if (!currentDraftId) return false;
    if (!writeCurrentDraft(captureCurrentDraft())) return false;
    // Remove the recovered source only after its replacement is durable.
    // Leave it alone if another tab has changed it in the meantime.
    if (currentDraftSourceId && removeCurrentDraft(currentDraftSourceId, currentDraftSourceUpdatedAt)) {
        currentDraftSourceId = null;
        currentDraftSourceUpdatedAt = null;
    }
    return true;
}

function scheduleCurrentDraftSave() {
    if (!currentDraftId) return;
    clearTimeout(currentDraftTimer);
    currentDraftTimer = setTimeout(() => { currentDraftTimer = null; saveCurrentDraftNow(); }, 400);
}

function flushCurrentDraftSave() {
    clearTimeout(currentDraftTimer);
    currentDraftTimer = null;
    return saveCurrentDraftNow();
}

function removeCurrentDraft(draftId, expectedUpdatedAt = null) {
    try {
        const key = CURRENT_DRAFT_STORAGE_KEY + draftId;
        if (expectedUpdatedAt) {
            const draft = JSON.parse(localStorage.getItem(key) || 'null');
            if (draft?.updatedAt !== expectedUpdatedAt) return true;
        }
        localStorage.removeItem(key);
        return true;
    } catch (error) {
        renderPersistenceNotice('下書きを削除できませんでした。保存領域を確認してから再試行してください。');
        return false;
    }
}

function renderCurrentDraftCandidates() {
    const host = document.getElementById('view-home');
    if (!host) return;
    host.querySelector('#moyari-draft-candidates')?.remove();
    const drafts = readCurrentDraftCandidates();
    if (drafts.length === 0) return;
    const section = document.createElement('section');
    section.id = 'moyari-draft-candidates';
    section.setAttribute('aria-label', '保存された下書き');
    const heading = document.createElement('h2');
    heading.textContent = '途中の下書き';
    section.appendChild(heading);
    drafts.forEach(draft => {
        const row = document.createElement('div');
        row.className = 'moyari-draft-row';
        const resume = document.createElement('button');
        resume.type = 'button';
        resume.textContent = `続きから再開（${new Date(draft.updatedAt).toLocaleString()}）`;
        resume.addEventListener('click', () => resumeCurrentDraft(draft.id));
        const discard = document.createElement('button');
        discard.type = 'button';
        discard.textContent = '下書きを削除';
        discard.addEventListener('click', () => {
            if (!confirm('この下書きを削除しますか？')) return;
            if (draft.id === currentDraftId) {
                if (!discardCurrentDraft()) return;
            } else if (!removeCurrentDraft(draft.id, draft.updatedAt)) return;
            renderCurrentDraftCandidates();
        });
        row.append(resume, discard);
        section.appendChild(row);
    });
    host.appendChild(section);
}

function resumeCurrentDraft(draftId) {
    const draft = readCurrentDraftCandidates().find(candidate => candidate.id === draftId);
    if (!draft) return;
    currentDraftSourceId = draft.id;
    currentDraftSourceUpdatedAt = draft.updatedAt;
    currentDraftId = `draft_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    currentRecord = JSON.parse(JSON.stringify(draft.currentRecord));
    currentBodyPartId = draft.currentBodyPartId || null;
    if (!Array.isArray(currentRecord.selectedOrder)) currentRecord.selectedOrder = draft.selectedOrder || [];
    renderCurrentDraftCandidates();
    renderBehaviorSigns();
    renderExternalFactors();
    renderMindNotifications();
    renderBodyParts();
    renderBodySensationsForPart();
    renderSelectedBodyPartsBar();
    updateCardIndicators();
    renderNextActions();
    renderSummary();
    renderReview();
    const slider = document.getElementById('input-moyari-level');
    const display = document.getElementById('display-moyari-level');
    if (slider) slider.value = currentRecord.moyariLevel;
    if (display) display.textContent = currentRecord.moyariLevel;
    const viewId = document.getElementById(draft.viewId) ? draft.viewId : 'view-step1-behavior';
    switchView(viewId);
}

function clearCurrentDraftAfterSave() {
    clearTimeout(currentDraftTimer);
    currentDraftTimer = null;
    let success = !currentDraftId || removeCurrentDraft(currentDraftId);
    if (currentDraftSourceId) success = removeCurrentDraft(currentDraftSourceId, currentDraftSourceUpdatedAt) && success;
    if (!success) return false;
    currentDraftId = null;
    currentDraftSourceId = null;
    currentDraftSourceUpdatedAt = null;
    renderCurrentDraftCandidates();
    return success;
}

function beginCurrentDraft() {
    currentDraftId = `draft_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    currentDraftSourceId = null;
}

function markCurrentRecordChanged() {
    const visible = document.querySelector('.view:not([hidden])');
    if (visible) renderStepProgress(visible);
    scheduleCurrentDraftSave();
}

window.addEventListener('pagehide', flushCurrentDraftSave);
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushCurrentDraftSave();
});

/* ========================================
   4. UI制御 (画面切り替え・モーダル・トースト・クリップボード)
======================================== */
function switchView(viewId) {
    document.querySelectorAll('.view').forEach(view => {
        view.hidden = true;
    });

    // 画面遷移時に開いているフローティングナビパネルを全て閉じる
    document.querySelectorAll('.floating-nav-panel').forEach(panel => {
        panel.hidden = true;
    });

    const targetView = document.getElementById(viewId);
    if (targetView) {
        targetView.hidden = false;
        if (currentDraftId) flushCurrentDraftSave();
        renderStepProgress(targetView);
        window.scrollTo(0, 0);
    } else {
        console.error(`View not found: ${viewId}`);
    }
}

function renderStepProgress(view) {
    const labels = {
        'view-step1-behavior': '1 / 6 行動のサイン', 'view-step2-cards': '2 / 6 モヤリの中身',
        'view-step2-external': '2 / 6 モヤリの中身・外的要因', 'view-step2-mind': '2 / 6 モヤリの中身・頭の中',
        'view-step2-body': '2 / 6 モヤリの中身・身体感覚', 'view-step3-level': '3 / 6 モヤリ度',
        'view-step4-summary': '4 / 6 まとめ', 'view-step5-action': '5 / 6 次の一手', 'view-step6-save': '6 / 6 保存'
    };
    if (!labels[view.id]) return;
    let progress = view.querySelector('.moyari-step-progress');
    if (!progress) {
        progress = document.createElement('p');
        progress.className = 'moyari-step-progress';
        progress.setAttribute('aria-live', 'polite');
        (view.querySelector('header') || view).prepend(progress);
    }
    const count = currentRecord.behaviorSigns.length + currentRecord.externalFactors.length + currentRecord.mindNotifications.length + currentRecord.body.entries.length + currentRecord.nextActions.length;
    const next = view.id === 'view-step6-save' ? '内容を確認して保存できます' : view.id.startsWith('view-step2-') && view.id !== 'view-step2-cards' ? '選び終えたら上の戻るボタンで戻れます' : '次へ進めます。一つだけでも、未選択でも大丈夫です';
    progress.textContent = `${labels[view.id]} ・ ${count}件選択 ・ ${next}`;
}

function openModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) modal.hidden = false;
}

function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) modal.hidden = true;
}

function showToast(message, durationMs = 3000) {
    const toast = document.getElementById('toast-message');
    if (!toast) return;

    toast.textContent = message;
    toast.hidden = false;

    setTimeout(() => {
        toast.hidden = true;
    }, durationMs);
}

function openAddItemModal(category, group, afterAddCallback) {
    currentAddItemContext = { category, group, afterAddCallback };
    const input = document.getElementById('input-add-item-name');
    if (input) {
        input.value = '';
    }
    openModal('modal-add-item');
    if (input) {
        setTimeout(() => input.focus(), 50);
    }
}

function closeAddItemModal() {
    currentAddItemContext = null;
    closeModal('modal-add-item');
}

async function copyTextToClipboard(text, successMessage = 'コピーしました') {
    if (!text) return;

    if (navigator.clipboard && navigator.clipboard.writeText) {
        try {
            await navigator.clipboard.writeText(text);
            showToast(successMessage);
            return;
        } catch (err) {
            console.warn('Clipboard API failed, falling back to execCommand', err);
        }
    }

    try {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        const successful = document.execCommand('copy');
        document.body.removeChild(textarea);

        if (successful) {
            showToast(successMessage);
        } else {
            showToast('コピーに失敗しました。テキストを選択してコピーしてください。');
        }
    } catch (err) {
        console.error('Fallback copy failed', err);
        showToast('コピーに失敗しました。テキストを選択してコピーしてください。');
    }
}

// フローティングナビゲーションのスクロール補助関数
function scrollToElementWithOffset(element, offset = 72) {
    const rect = element.getBoundingClientRect();
    const top = window.scrollY + rect.top - offset;
    window.scrollTo({ top, behavior: 'smooth' });
}

function updateFloatingNavForView(viewId) {
    const view = document.getElementById(viewId);
    if (!view) return;

    const floatingNav = view.querySelector('[data-floating-nav]');
    if (!floatingNav) return;

    const linksContainer = floatingNav.querySelector('[data-floating-links]');
    if (!linksContainer) return;

    linksContainer.innerHTML = '';

    const headings = view.querySelectorAll('.option-group-title, .floating-target-heading');

    headings.forEach((heading, index) => {
        if (!heading.id) {
            heading.id = `${viewId}-heading-${index}`;
        }

        const btn = document.createElement('button');
        btn.type = 'button';
        btn.textContent = heading.textContent;
        btn.addEventListener('click', () => {
            scrollToElementWithOffset(heading);
            btn.blur();
            const panel = floatingNav.querySelector('.floating-nav-panel');
            if (panel) {
                panel.querySelectorAll('button').forEach(b => b.blur());
                panel.hidden = true;
            }
        });
        linksContainer.appendChild(btn);
    });
}

/* ========================================
   エクスポート (ファイル書き出し) 関数群
======================================== */
function downloadTextFile(filename, text) {
    try {
        const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        return true;
    } catch (err) {
        console.error("Download failed", err);
        return false;
    }
}

function formatDateForFilename(isoString) {
    const d = new Date(isoString);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const hh = String(d.getHours()).padStart(2, '0');
    const min = String(d.getMinutes()).padStart(2, '0');
    return `${yyyy}${mm}${dd}_${hh}${min}`;
}

// テキスト出力用の強さグループ関数
function formatGroupedText(itemsWithLabels, scaleType = 'intensity') {
    let groups = {};
    if (scaleType === 'feasibility') {
        groups = {
            strong: { label: '◎ やる', items: itemsWithLabels.filter(i => i.strength === 'strong') },
            some: { label: '○ できそう', items: itemsWithLabels.filter(i => i.strength === 'some' || !i.strength) },
            slight: { label: '△ 少しできそう', items: itemsWithLabels.filter(i => i.strength === 'slight') }
        };
    } else {
        groups = {
            strong: { label: '◎ 強い', items: itemsWithLabels.filter(i => i.strength === 'strong') },
            some: { label: '○ ある', items: itemsWithLabels.filter(i => i.strength === 'some' || !i.strength) },
            slight: { label: '△ 少し', items: itemsWithLabels.filter(i => i.strength === 'slight') }
        };
    }

    let parts = [];
    ['strong', 'some', 'slight'].forEach(key => {
        if (groups[key].items.length > 0) {
            parts.push(`${groups[key].label}\n${groups[key].items.map(item => `・${item.label}`).join('\n')}`);
        }
    });

    return parts.length > 0 ? parts.join('\n\n') : '未選択';
}

function generateRecordExportText(record) {
    let textParts = [];
    textParts.push("モヤリハット記録\n");
    textParts.push(`日時：\n${formatDate(record.createdAt)}\n`);
    textParts.push(`モヤリ度：\n${record.moyariLevel}\n`);
    textParts.push(`まとめ：\n${record.summaryText || 'なし'}\n`);

    // 行動のサイン
    let behaviorText = '未選択';
    if (record.behaviorSigns && record.behaviorSigns.length > 0) {
        behaviorText = getRecordSelectedLabels(record, record.behaviorSigns).map(s => `・${s.label}`).join('\n');
    }
    textParts.push(`行動のサイン：\n${behaviorText}\n`);

    // 影響していそうな条件
    let externalText = '未選択';
    if (record.externalFactors && record.externalFactors.length > 0) {
        externalText = formatGroupedText(getRecordSelectedLabels(record, record.externalFactors), 'intensity');
    }
    textParts.push(`影響していそうな条件：\n${externalText}\n`);

    // 頭の中の通知
    let mindText = '未選択';
    if (record.mindNotifications && record.mindNotifications.length > 0) {
        mindText = formatGroupedText(getRecordSelectedLabels(record, record.mindNotifications), 'intensity');
    }
    textParts.push(`頭の中の通知：\n${mindText}\n`);

    // 身体感覚
    let bodyText = '未選択';
    if (record.body && record.body.entries && record.body.entries.length > 0) {
        bodyText = formatGroupedText(getBodySensationsWithLabels(record), 'intensity');
    }
    textParts.push(`身体感覚：\n${bodyText}\n`);

    // 次の一手
    let actionText = '未選択';
    if (record.nextActions && record.nextActions.length > 0) {
        actionText = formatGroupedText(getRecordSelectedLabels(record, record.nextActions), 'feasibility');
    }
    textParts.push(`次の一手：\n${actionText}\n`);

    return textParts.join('\n');
}

function openConsultCopyModal() {
    if (!currentDetailRecord) {
        showToast('コピーする記録が見つかりません');
        return;
    }

    document.querySelectorAll('.consult-purpose-checkbox').forEach(checkbox => {
        checkbox.checked = false;
    });

    const noteInput = document.getElementById('input-consult-note');
    if (noteInput) {
        noteInput.value = '';
    }

    openModal('modal-consult-copy');
}

function closeConsultCopyModal() {
    closeModal('modal-consult-copy');
}

function getRecordNextActionsText(record) {
    if (!record || !Array.isArray(record.nextActions) || record.nextActions.length === 0) {
        return '';
    }

    const actions = getRecordSelectedLabels(record, record.nextActions)
        .map(item => item.label)
        .filter(Boolean);

    if (actions.length === 0) {
        return '';
    }

    return actions.map(label => `・${label}`).join('\n');
}
function getConsultProblemText(record) {
    const rawText = record?.summaryText || '';

    const cleanedText = rawText
        .split('\n')
        .map(line => line.trim())
        .filter(line => line !== '今は、別のやり方を選ぶと動きやすくなるかもしれません。')
        .join('\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();

    return cleanedText || 'まだうまく言葉にできていません。';
}
function generateConsultCopyText(record, purposes, noteText) {
    const parts = [];

    parts.push('【モヤリハット相談メモ】');
    parts.push('');
    parts.push('日時：');
    parts.push(formatDate(record.createdAt));
    parts.push('');
    parts.push('モヤリ度：');
    parts.push(String(record.moyariLevel ?? '未記録'));
    parts.push('');
    parts.push('今、困っていること：');
    parts.push(getConsultProblemText(record));
    parts.push('');
    parts.push('相談したいこと：');

    purposes.forEach(purpose => {
        parts.push(`・${purpose}`);
    });

    const trimmedNote = noteText ? noteText.trim() : '';
    if (trimmedNote) {
        parts.push('');
        parts.push('補足：');
        parts.push(trimmedNote);
    }

    const nextActionsText = getRecordNextActionsText(record);
    if (nextActionsText) {
        parts.push('');
        parts.push('自分で考えた候補：');
        parts.push(nextActionsText);
    }

    return parts.join('\n');
}

function copyConsultMemo() {
    if (!currentDetailRecord) {
        showToast('コピーする記録が見つかりません');
        return;
    }

    const purposes = Array.from(document.querySelectorAll('.consult-purpose-checkbox:checked'))
        .map(checkbox => checkbox.value)
        .filter(Boolean);

    if (purposes.length === 0) {
        showToast('相談したいことを1つ以上選んでください');
        return;
    }

    const noteInput = document.getElementById('input-consult-note');
    const noteText = noteInput ? noteInput.value : '';

    const text = generateConsultCopyText(currentDetailRecord, purposes, noteText);

    copyTextToClipboard(text, '相談用メモをコピーしました');
    closeConsultCopyModal();
}

function generateRecordsExportText(records, title) {
    let parts = [];
    parts.push(`${title}\n`);
    parts.push(`書き出し日時：\n${formatDate(new Date().toISOString())}\n`);
    parts.push(`記録件数：\n${records.length}件\n`);

    records.forEach((record, index) => {
        parts.push(`========================================\n${index + 1}件目\n========================================\n`);
        parts.push(generateRecordExportText(record));
    });

    return parts.join('\n');
}

function generateAllRecordsExportText() {
    return generateRecordsExportText(appState.records, 'モヤリハット記録一覧');
}

function generateSelectedRecordsExportText(records) {
    return generateRecordsExportText(records, 'モヤリハット選択記録');
}


/* ========================================
   選択エクスポートの状態管理
======================================== */
function updateSelectedExportState() {
    // 存在しないIDをパージ
    const currentRecordIds = new Set(appState.records.map(r => r.id));
    for (const id of selectedExportRecordIds) {
        if (!currentRecordIds.has(id)) {
            selectedExportRecordIds.delete(id);
        }
    }

    const count = selectedExportRecordIds.size;
    const countEl = document.getElementById('selected-records-count');
    const btn = document.getElementById('btn-export-selected-records');

    if (countEl) {
        if (count === 0) {
            countEl.textContent = '選択中の記録はありません。';
        } else {
            countEl.textContent = `${count}件の記録を選択中です。`;
        }
    }

    if (btn) {
        btn.disabled = count === 0;
    }
}

function syncRecordFilterControls() {
    const keywordInput = document.getElementById('input-record-search');
    const levelSelect = document.getElementById('select-record-level-filter');
    const sortSelect = document.getElementById('select-record-sort');

    if (keywordInput) keywordInput.value = recordListFilter.keyword;
    if (levelSelect) levelSelect.value = recordListFilter.minLevel;
    if (sortSelect) sortSelect.value = recordListFilter.sort;
}

function readRecordFilterControls() {
    const keywordInput = document.getElementById('input-record-search');
    const levelSelect = document.getElementById('select-record-level-filter');
    const sortSelect = document.getElementById('select-record-sort');

    recordListFilter.keyword = keywordInput ? keywordInput.value.trim() : '';
    recordListFilter.minLevel = levelSelect ? levelSelect.value : 'all';
    recordListFilter.sort = sortSelect ? sortSelect.value : 'newest';
}

function getRecordSearchText(record) {
    const parts = [];

    if (record.createdAt) {
        parts.push(formatDate(record.createdAt));
    }

    if (typeof record.moyariLevel === 'number') {
        parts.push(`モヤリ度 ${record.moyariLevel}`);
    }

    if (record.summaryText) {
        parts.push(record.summaryText);
    }

    if (record.itemSnapshot && typeof record.itemSnapshot === 'object') {
        Object.values(record.itemSnapshot).forEach(snapshot => {
            if (snapshot && snapshot.label) {
                parts.push(snapshot.label);
            }
            if (snapshot && snapshot.group) {
                parts.push(snapshot.group);
            }
            if (snapshot && snapshot.category) {
                parts.push(snapshot.category);
            }
        });
    }

    try {
        if (Array.isArray(record.behaviorSigns)) {
            getRecordSelectedLabels(record, record.behaviorSigns).forEach(item => parts.push(item.label));
        }

        if (Array.isArray(record.externalFactors)) {
            getRecordSelectedLabels(record, record.externalFactors).forEach(item => parts.push(item.label));
        }

        if (Array.isArray(record.mindNotifications)) {
            getRecordSelectedLabels(record, record.mindNotifications).forEach(item => parts.push(item.label));
        }

        if (Array.isArray(record.nextActions)) {
            getRecordSelectedLabels(record, record.nextActions).forEach(item => parts.push(item.label));
        }

        getBodySensationsWithLabels(record).forEach(item => parts.push(item.label));
    } catch (error) {
        console.warn('検索用テキストの作成中に一部を読み飛ばしました:', error);
    }

    return parts.join(' ').toLowerCase();
}

function getFilteredRecords() {
    let records = Array.isArray(appState.records) ? [...appState.records] : [];

    const keyword = recordListFilter.keyword.trim().toLowerCase();

    if (keyword) {
        records = records.filter(record => {
            return getRecordSearchText(record).includes(keyword);
        });
    }

    if (recordListFilter.minLevel !== 'all') {
        const minLevel = Number(recordListFilter.minLevel);
        records = records.filter(record => {
            const level = typeof record.moyariLevel === 'number' ? record.moyariLevel : 0;
            return level >= minLevel;
        });
    }

    records.sort((a, b) => {
        if (recordListFilter.sort === 'oldest') {
            return new Date(a.createdAt) - new Date(b.createdAt);
        }

        if (recordListFilter.sort === 'levelDesc') {
            return (b.moyariLevel || 0) - (a.moyariLevel || 0);
        }

        if (recordListFilter.sort === 'levelAsc') {
            return (a.moyariLevel || 0) - (b.moyariLevel || 0);
        }

        return new Date(b.createdAt) - new Date(a.createdAt);
    });

    return records;
}

function updateRecordFilterResultNote(filteredCount, totalCount) {
    const note = document.getElementById('records-filter-result-note');
    if (!note) return;

    const hasFilter =
        recordListFilter.keyword ||
        recordListFilter.minLevel !== 'all' ||
        recordListFilter.sort !== 'newest';

    if (!hasFilter) {
        note.textContent = totalCount === 0
            ? '記録はまだありません。'
            : `すべての記録 ${totalCount} 件を表示しています。`;
        return;
    }

    note.textContent = `${totalCount} 件中 ${filteredCount} 件を表示しています。`;
}

function clearRecordFilters() {
    recordListFilter = {
        keyword: '',
        minLevel: 'all',
        sort: 'newest'
    };

    selectedExportRecordIds.clear();
    syncRecordFilterControls();
    renderRecordsList();
}

/* ========================================
   未保存確認とリセットロジック
======================================== */
function hasCurrentRecordDraft() {
    return currentRecord.behaviorSigns.length > 0 ||
        currentRecord.externalFactors.length > 0 ||
        currentRecord.mindNotifications.length > 0 ||
        currentRecord.body.entries.length > 0 ||
        currentRecord.moyariLevel > 0 ||
        currentRecord.nextActions.length > 0;
}

function confirmDiscardDraft() {
    if (!hasCurrentRecordDraft()) return true;
    return confirm('保存していない内容は消えます。ホームへ戻りますか？');
}

function resetCurrentRecord() {
    currentRecord = JSON.parse(JSON.stringify(INITIAL_CURRENT_RECORD));
    currentBodyPartId = null;
}

function discardCurrentDraft() {
    if (!clearCurrentDraftAfterSave()) return false;
    resetCurrentRecord();
    renderCurrentDraftCandidates();
    return true;
}

/* ========================================
   5. 項目データ操作 (第5段階)
======================================== */
function addCustomItem(category, group, label) {
    const randomStr = Math.random().toString(36).slice(2, 8);
    const newItem = {
        id: `custom_${category}_${Date.now()}_${randomStr}`,
        category: category,
        group: group,
        label: label,
        appliesToParts: null,
        isDefault: false,
        isHidden: false,
        createdAt: new Date().toISOString(),
        useCount: 0,
        lastUsedAt: null
    };
    appState.items.push(newItem);
    return newItem;
}

// --- 設定画面の描画 ---
function renderSettingsView() {
    const infoContainer = document.getElementById('settings-app-info');
    if (!infoContainer) return;

    const recordCount = Array.isArray(appState.records) ? appState.records.length : 0;
    const totalItemCount = Array.isArray(appState.items) ? appState.items.length : 0;
    const customItemCount = Array.isArray(appState.items)
        ? appState.items.filter(item => item.isDefault === false).length
        : 0;
    const hiddenItemCount = Array.isArray(appState.items)
        ? appState.items.filter(item => item.isHidden === true).length
        : 0;

    let approxSizeText = '計算不可';
    try {
        const stateString = JSON.stringify(appState);
        const bytes = new Blob([stateString]).size;
        if (bytes < 1024) {
            approxSizeText = `${bytes} B`;
        } else if (bytes < 1024 * 1024) {
            approxSizeText = `${(bytes / 1024).toFixed(1)} KB`;
        } else {
            approxSizeText = `${(bytes / 1024 / 1024).toFixed(2)} MB`;
        }
    } catch (error) {
        approxSizeText = '計算不可';
    }

    const lastSaved = appState.lastSavedAt
        ? formatDate(appState.lastSavedAt)
        : '未保存';

    infoContainer.innerHTML = `
        <div class="info-row"><span class="info-label">アプリバージョン:</span> <span class="info-value">${APP_VERSION}</span></div>
        <div class="info-row"><span class="info-label">データ形式バージョン:</span> <span class="info-value">v${appState.schemaVersion}</span></div>
        <div class="info-row"><span class="info-label">記録件数:</span> <span class="info-value">${recordCount} 件</span></div>
        <div class="info-row"><span class="info-label">項目件数:</span> <span class="info-value">${totalItemCount} 件</span></div>
        <div class="info-row"><span class="info-label">うち追加項目:</span> <span class="info-value">${customItemCount} 件</span></div>
        <div class="info-row"><span class="info-label">うち非表示:</span> <span class="info-value">${hiddenItemCount} 件</span></div>
        <div class="info-row"><span class="info-label">データサイズ:</span> <span class="info-value">${approxSizeText}</span></div>
        <div class="info-row"><span class="info-label">最終保存日時:</span> <span class="info-value">${lastSaved}</span></div>
    `;

    const restoreInput = document.getElementById('input-restore-json');
    const restoreButton = document.getElementById('btn-restore-json');

    if (restoreInput) restoreInput.value = '';
    if (restoreButton) restoreButton.disabled = true;
    pendingRestoreData = null;

    const resetAllCheck = document.getElementById('confirm-reset-all-check');
    const resetAllText = document.getElementById('confirm-reset-all-text');
    const resetAllButton = document.getElementById('btn-reset-all');

    if (resetAllCheck) resetAllCheck.checked = false;
    if (resetAllText) resetAllText.value = '';
    if (resetAllButton) resetAllButton.disabled = true;

}

function exportBackupJson() {
    if (recoveryRequired && recoveryRaw) {
        if (downloadTextFile('moyarihat-recovery-original.txt', recoveryRaw)) showToast('復旧用の元データを書き出しました');
        else showToast('元データを書き出せませんでした。端末内の元データは保持しています。');
        return;
    }
    if (!appState) {
        showToast('バックアップするデータが見つかりません');
        return;
    }

    const exportedAt = new Date().toISOString();

    const payload = {
        appName: 'モヤリハット',
        backupType: 'moyarihat-full-backup',
        appVersion: APP_VERSION,
        schemaVersion: APP_SCHEMA_VERSION,
        exportedAt: exportedAt,
        storageKey: STORAGE_KEY,
        state: appState
    };

    const jsonText = JSON.stringify(payload, null, 2);
    const filename = `moyarihat_backup_${formatDateForFilename(exportedAt)}.json`;

    const success = downloadTextFile(filename, jsonText);

    if (success) {
        showToast('復元用バックアップを書き出しました');
    } else {
        copyTextToClipboard(jsonText, 'ファイル保存に失敗したため、バックアップ内容をコピーしました');
    }
}


function handleRestoreFileSelected(event) {
    const fileInput = event.target;
    const file = fileInput.files && fileInput.files[0];
    const restoreButton = document.getElementById('btn-restore-json');

    pendingRestoreData = null;

    if (restoreButton) {
        restoreButton.disabled = true;
    }

    if (!file) {
        return;
    }

    const reader = new FileReader();

    reader.onload = (loadEvent) => {
        try {
            const parsed = JSON.parse(loadEvent.target.result);
            let candidateState = null;

            if (
                parsed &&
                parsed.backupType === 'moyarihat-full-backup' &&
                parsed.state &&
                typeof parsed.state === 'object'
            ) {
                candidateState = parsed.state;
            } else if (
                parsed &&
                typeof parsed === 'object' &&
                Array.isArray(parsed.items) &&
                Array.isArray(parsed.records)
            ) {
                candidateState = parsed;
            }

            if (!candidateState) {
                pendingRestoreData = null;
                if (restoreButton) restoreButton.disabled = true;
                showToast('モヤリハットのバックアップとして読み込めませんでした');
                return;
            }

            pendingRestoreData = candidateState;
            if (restoreButton) restoreButton.disabled = false;
            showToast('バックアップファイルを読み込みました');
        } catch (error) {
            console.error('バックアップJSONの読み込みに失敗しました:', error);
            pendingRestoreData = null;
            if (restoreButton) restoreButton.disabled = true;
            fileInput.value = '';
            showToast('JSONファイルとして読み込めませんでした');
        }
    };

    reader.onerror = () => {
        pendingRestoreData = null;
        if (restoreButton) restoreButton.disabled = true;
        fileInput.value = '';
        showToast('ファイルの読み込みに失敗しました');
    };

    reader.readAsText(file);
}

function restoreFromSelectedBackup() {
    if (!pendingRestoreData) {
        showToast('復元するバックアップが選択されていません');
        return;
    }

    const confirmed = confirm(
        '現在のデータは、読み込んだバックアップの内容に置き換わります。先に現在のバックアップを書き出すことをおすすめします。復元しますか？'
    );

    if (!confirmed) {
        return;
    }

    const previousState = JSON.parse(JSON.stringify(appState));
    const previousRecovery = { recoveryRequired, storageReadDenied, recoveryNotice, storageAvailable, persistedRaw };
    let committed = false;
    try {
        const restoredState = JSON.parse(JSON.stringify(pendingRestoreData));
        if (!restoredState || !Array.isArray(restoredState.items) || !Array.isArray(restoredState.records)) {
            throw new Error('バックアップの形式が正しくありません');
        }
        appState = normalizeState(restoredState);

        if (!Array.isArray(appState.items) || appState.items.length === 0) {
            appState.items = createDefaultItems();
        }

        const wasRecoveryBlocked = recoveryRequired;
        recoveryRequired = false;
        recoveryNotice = null;
        storageAvailable = true;
        storageReadDenied = false;
        persistedRaw = localStorage.getItem(STORAGE_KEY);
        if (!saveState()) {
            appState = previousState;
            recoveryRequired = previousRecovery.recoveryRequired;
            storageReadDenied = previousRecovery.storageReadDenied;
            persistedRaw = previousRecovery.persistedRaw;
            if (wasRecoveryBlocked) recoveryNotice = '保存データの復旧中に保存できませんでした。元データは保持されています。保存領域を確保してから復元を再試行してください。';
            showToast('保存に失敗したため、バックアップから復元できませんでした');
            return;
        }
        committed = true;
        recoveryRequired = false;
        recoveryNotice = null;
        storageAvailable = true;
        renderPersistenceNotice();
        resetCurrentRecord();
        selectedExportRecordIds.clear();
        pendingRestoreData = null;

        const restoreInput = document.getElementById('input-restore-json');
        const restoreButton = document.getElementById('btn-restore-json');

        if (restoreInput) restoreInput.value = '';
        if (restoreButton) restoreButton.disabled = true;

        renderSettingsView();
        showToast('バックアップから復元しました');
    } catch (error) {
        if (!committed) {
            appState = previousState;
            recoveryRequired = previousRecovery.recoveryRequired;
            storageReadDenied = previousRecovery.storageReadDenied;
            persistedRaw = previousRecovery.persistedRaw;
            storageAvailable = previousRecovery.storageAvailable;
            recoveryNotice = previousRecovery.recoveryNotice;
            renderPersistenceNotice();
        }
        console.error('バックアップからの復元に失敗しました:', error);
        showToast('バックアップから復元できませんでした');
    }
}

function clearRecordsFromSettings() {
    const confirmed = confirm(
        '保存済みの記録をすべて削除します。項目設定は残ります。実行しますか？'
    );

    if (!confirmed) return;

    appState.records = [];
    if (!saveState()) return;
    selectedExportRecordIds.clear();
    renderSettingsView();

    showToast('保存済みの記録をすべて削除しました');
}

function resetItemsFromSettings() {
    const confirmed = confirm(
        '追加した項目や非表示設定を初期状態に戻します。保存済みの記録は残ります。実行しますか？'
    );

    if (!confirmed) return;

    appState.items = createDefaultItems();
    if (!saveState()) return;
    renderSettingsView();

    showToast('項目設定を初期化しました');
}

function updateResetAllButtonState() {
    const check = document.getElementById('confirm-reset-all-check');
    const text = document.getElementById('confirm-reset-all-text');
    const button = document.getElementById('btn-reset-all');

    if (!check || !text || !button) return;

    button.disabled = !(check.checked && text.value === '初期化');
}

function resetAllFromSettings() {
    const confirmed = confirm(
        'すべての記録、追加項目、項目設定、初回ガイド確認状態を初期化します。この操作は元に戻せません。実行しますか？'
    );

    if (!confirmed) return;

    const previousState = JSON.parse(JSON.stringify(appState));
    const previousPersistedRaw = persistedRaw;
    appState = JSON.parse(JSON.stringify(INITIAL_STATE));
    appState.items = createDefaultItems();

    const wasRecoveryRequired = recoveryRequired;
    const wasReadDenied = storageReadDenied;
    recoveryRequired = false;
    storageReadDenied = false;
    try { persistedRaw = localStorage.getItem(STORAGE_KEY); } catch (error) { storageReadDenied = true; }
    if (!saveState()) {
        appState = previousState;
        persistedRaw = previousPersistedRaw;
        recoveryRequired = wasRecoveryRequired;
        storageReadDenied = wasReadDenied;
        showToast('保存に失敗したため、初期化を完了できませんでした');
        return;
    }
    selectedExportRecordIds.clear();
    currentDetailRecord = null;
    pendingRestoreData = null;
    discardCurrentDraft();
    readCurrentDraftCandidates().forEach(draft => removeCurrentDraft(draft.id));

    const check = document.getElementById('confirm-reset-all-check');
    const text = document.getElementById('confirm-reset-all-text');
    const button = document.getElementById('btn-reset-all');

    if (check) check.checked = false;
    if (text) text.value = '';
    if (button) button.disabled = true;

    showToast('すべてのデータを初期化しました');
    switchView('view-guide');
}
function showGuideAgainFromSettings() {
    appState.hasSeenGuide = false;
    if (!saveState()) return;
    showToast('初回ガイドを表示します');
    switchView('view-guide');
}

function getApproxStorageSizeText() {
    try {
        const stateString = JSON.stringify(appState);
        const bytes = new Blob([stateString]).size;

        if (bytes < 1024) {
            return `${bytes} B`;
        }

        if (bytes < 1024 * 1024) {
            return `${(bytes / 1024).toFixed(1)} KB`;
        }

        return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
    } catch (error) {
        return '計算不可';
    }
}

function copyDiagnostics() {
    const diagnostics = {
        appName: 'モヤリハット',
        appVersion: APP_VERSION,
        schemaVersion: appState?.schemaVersion ?? null,
        storageKey: STORAGE_KEY,
        recordCount: Array.isArray(appState?.records) ? appState.records.length : 0,
        itemCount: Array.isArray(appState?.items) ? appState.items.length : 0,
        customItemCount: Array.isArray(appState?.items)
            ? appState.items.filter(item => item.isDefault === false).length
            : 0,
        hiddenItemCount: Array.isArray(appState?.items)
            ? appState.items.filter(item => item.isHidden === true).length
            : 0,
        approximateStorageSize: getApproxStorageSizeText(),
        lastSavedAt: appState?.lastSavedAt ?? null,
        userAgent: navigator.userAgent,
        href: location.href,
        timestamp: new Date().toISOString()
    };

    const text = JSON.stringify(diagnostics, null, 2);
    copyTextToClipboard(text, '診断情報をコピーしました');
}

function hardReloadFromSettings() {
    window.location.reload();
}

async function clearCacheAndReload() {
    const confirmed = confirm(
        'このアプリの一時保存データを削除して再読み込みします。記録や項目設定は消えません。実行しますか？'
    );

    if (!confirmed) return;

    try {
        if ('caches' in window) {
            const cacheKeys = await caches.keys();

            const targetKeys = cacheKeys.filter(key =>
                key.toLowerCase().includes('moyarihat') ||
                key.toLowerCase().includes('moyari')
            );

            if (targetKeys.length > 0) {
                for (const key of targetKeys) {
                    await caches.delete(key);
                }
            } else if (cacheKeys.length > 0) {
                const deleteAllConfirmed = confirm(
                    'このアプリ用のキャッシュ名を特定できませんでした。このサイトの一時保存データを削除して再読み込みしますか？記録データは消えません。'
                );

                if (!deleteAllConfirmed) return;

                for (const key of cacheKeys) {
                    await caches.delete(key);
                }
            }
        }

        if ('serviceWorker' in navigator) {
            const registrations = await navigator.serviceWorker.getRegistrations();
            for (const registration of registrations) {
                await registration.update();
            }
        }

        showToast('再読み込みします');
        setTimeout(() => {
            window.location.reload();
        }, 500);
    } catch (error) {
        console.error('キャッシュ削除または更新確認に失敗しました:', error);
        showToast('キャッシュ削除に失敗しました。通常の再読み込みをします');
        setTimeout(() => {
            window.location.reload();
        }, 800);
    }
}

function renderChangelogContent() {
    const container = document.getElementById('changelog-content');
    if (!container) return;

    container.innerHTML = '';

    CHANGELOG.forEach(log => {
        const versionDiv = document.createElement('div');
        versionDiv.className = 'changelog-version';
        versionDiv.textContent = `バージョン ${log.version}`;

        const dateDiv = document.createElement('div');
        dateDiv.className = 'changelog-date';
        dateDiv.textContent = log.date;

        const ul = document.createElement('ul');
        ul.className = 'changelog-list';

        log.items.forEach(item => {
            const li = document.createElement('li');
            li.textContent = item;
            ul.appendChild(li);
        });

        container.appendChild(versionDiv);
        container.appendChild(dateDiv);
        container.appendChild(ul);
    });
}

function showChangelogModal() {
    renderChangelogContent();
    openModal('modal-changelog');
}

function checkAppUpdate() {
    try {
        const lastSeenVersion = localStorage.getItem(LAST_SEEN_APP_VERSION_KEY);
        if (lastSeenVersion && lastSeenVersion !== APP_VERSION) showChangelogModal();
        localStorage.setItem(LAST_SEEN_APP_VERSION_KEY, APP_VERSION);
    } catch (error) {
        console.warn('更新情報を保存できませんでした', error);
    }
}

/* ========================================
   6. 描画と選択処理 (第2段階・第8段階改修)
======================================== */
function getVisibleItemsByCategory(category, filterFn = null, uniqueByLabel = false, selectedList = []) {
    let items = appState.items.filter(item => item.category === category && !item.isHidden);

    if (filterFn) {
        items = items.filter(filterFn);
    }

    if (uniqueByLabel) {
        const seen = new Set();
        const selectedItemIds = new Set(selectedList.map(i => i.itemId));
        const uniqueItems = [];

        // 選択済みのものを先に確保する
        items.forEach(item => {
            if (selectedItemIds.has(item.id)) {
                uniqueItems.push(item);
                seen.add(item.label);
            }
        });

        // 未選択のものを追加する（ラベルが被らないものだけ）
        items.forEach(item => {
            if (!selectedItemIds.has(item.id)) {
                if (!seen.has(item.label)) {
                    uniqueItems.push(item);
                    seen.add(item.label);
                }
            }
        });
        items = uniqueItems;
    }

    const grouped = {};
    items.forEach(item => {
        if (!grouped[item.group]) {
            grouped[item.group] = [];
        }
        grouped[item.group].push(item);
    });
    return grouped;
}

function renderGroupedOptions(containerId, category, selectedList, options) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = '';

    const filterFn = options.filterFn || null;
    const isUniqueByLabel = options.uniqueByLabel || false;
    const groupedItems = getVisibleItemsByCategory(category, filterFn, isUniqueByLabel, selectedList);
    const scaleType = options.scaleType || 'intensity';

    for (const groupName in groupedItems) {
        const groupTitle = document.createElement('h3');
        groupTitle.className = 'option-group-title';
        groupTitle.textContent = groupName;
        container.appendChild(groupTitle);

        groupedItems[groupName].forEach(item => {
            const selectedItem = selectedList.find(r => r.itemId === item.id);
            const isSelected = !!selectedItem;

            const wrapper = document.createElement('div');
            wrapper.className = 'option-wrapper';

            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'option-chip';
            if (options.currentActiveId === item.id) {
                btn.classList.add('is-current-part'); // 身体部位の現在選択中ハイライト
            }
            btn.textContent = item.label;
            btn.setAttribute('aria-pressed', isSelected ? 'true' : 'false');

            btn.addEventListener('click', () => {
                if (isSelected && options.onSelectedClick) {
                    options.onSelectedClick(item.id);
                } else if (isSelected) {
                    options.onRemove(item.id);
                } else {
                    options.onSelect(item.id, 'some');
                }
                markCurrentRecordChanged();
            });

            wrapper.appendChild(btn);

            if (options.showRemoveButton && isSelected) {
                wrapper.classList.add('has-remove');
                const removeBtn = document.createElement('button');
                removeBtn.type = 'button';
                removeBtn.className = 'option-remove-button';
                removeBtn.textContent = '×';
                removeBtn.setAttribute('aria-label', `${item.label}を選択から外す`);
                removeBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    options.onRemove(item.id);
                    markCurrentRecordChanged();
                });
                wrapper.appendChild(removeBtn);
            }

            if (options.showStrength && isSelected) {
                const strengthContainer = document.createElement('div');
                strengthContainer.className = 'strength-options';

                let strengths = [];
                if (scaleType === 'feasibility') {
                    strengths = [
                        { val: 'strong', label: '◎ やる' },
                        { val: 'some', label: '○ できそう' },
                        { val: 'slight', label: '△ 少しできそう' }
                    ];
                } else {
                    strengths = [
                        { val: 'strong', label: '◎ 強い' },
                        { val: 'some', label: '○ ある' },
                        { val: 'slight', label: '△ 少し' }
                    ];
                }

                strengths.forEach(st => {
                    const sBtn = document.createElement('button');
                    sBtn.type = 'button';
                    sBtn.textContent = st.label;
                    sBtn.className = 'strength-button';

                    if (selectedItem.strength === st.val) {
                        sBtn.classList.add('is-selected');
                    }

                    sBtn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        if (options.onChangeStrength) {
                            options.onChangeStrength(item.id, st.val);
                            markCurrentRecordChanged();
                        }
                    });
                    strengthContainer.appendChild(sBtn);
                });
                wrapper.appendChild(strengthContainer);
            }

            container.appendChild(wrapper);
        });
    }
}

function addToSelectedOrder(categoryKey) {
    if (!currentRecord.selectedOrder.includes(categoryKey)) {
        currentRecord.selectedOrder.push(categoryKey);
    }
}

function removeFromSelectedOrder(categoryKey) {
    currentRecord.selectedOrder = currentRecord.selectedOrder.filter(k => k !== categoryKey);
}

function renderBehaviorSigns() {
    renderGroupedOptions('container-behavior-options', 'behavior', currentRecord.behaviorSigns, {
        showStrength: false,
        onSelect: (itemId, strength) => {
            currentRecord.behaviorSigns.push({ itemId, strength });
            renderBehaviorSigns();
        },
        onRemove: (itemId) => {
            currentRecord.behaviorSigns = currentRecord.behaviorSigns.filter(i => i.itemId !== itemId);
            renderBehaviorSigns();
        }
    });
    updateFloatingNavForView('view-step1-behavior');
}

function renderExternalFactors() {
    renderGroupedOptions('container-external-options', 'external', currentRecord.externalFactors, {
        showStrength: true,
        scaleType: 'intensity',
        onSelect: (itemId, strength) => {
            currentRecord.externalFactors.push({ itemId, strength });
            addToSelectedOrder('external');
            renderExternalFactors();
        },
        onRemove: (itemId) => {
            currentRecord.externalFactors = currentRecord.externalFactors.filter(i => i.itemId !== itemId);
            if (currentRecord.externalFactors.length === 0) {
                removeFromSelectedOrder('external');
            }
            renderExternalFactors();
        },
        onChangeStrength: (itemId, strength) => {
            const item = currentRecord.externalFactors.find(i => i.itemId === itemId);
            if (item) item.strength = strength;
            renderExternalFactors();
        }
    });
    updateFloatingNavForView('view-step2-external');
}

function renderMindNotifications() {
    renderGroupedOptions('container-mind-options', 'mind', currentRecord.mindNotifications, {
        showStrength: true,
        scaleType: 'intensity',
        onSelect: (itemId, strength) => {
            currentRecord.mindNotifications.push({ itemId, strength });
            addToSelectedOrder('mind');
            renderMindNotifications();
        },
        onRemove: (itemId) => {
            currentRecord.mindNotifications = currentRecord.mindNotifications.filter(i => i.itemId !== itemId);
            if (currentRecord.mindNotifications.length === 0) {
                removeFromSelectedOrder('mind');
            }
            renderMindNotifications();
        },
        onChangeStrength: (itemId, strength) => {
            const item = currentRecord.mindNotifications.find(i => i.itemId === itemId);
            if (item) item.strength = strength;
            renderMindNotifications();
        }
    });
    updateFloatingNavForView('view-step2-mind');
}

// --- 身体感覚の描画ロジック ---
function getBodyEntry(partId) {
    return currentRecord.body.entries.find(e => e.partId === partId);
}

function ensureBodyEntry(partId) {
    let entry = getBodyEntry(partId);
    if (!entry) {
        entry = { partId: partId, sensations: [] };
        currentRecord.body.entries.push(entry);
    }
    return entry;
}

function removeBodyEntry(partId) {
    currentRecord.body.entries = currentRecord.body.entries.filter(e => e.partId !== partId);
}

function updateBodyOrder() {
    if (currentRecord.body.entries.length > 0) {
        addToSelectedOrder('body');
    } else {
        removeFromSelectedOrder('body');
    }
}

// 選択済み部位 追従バーの描画
function renderSelectedBodyPartsBar() {
    const bar = document.getElementById('body-selected-parts-bar');
    const container = document.getElementById('container-selected-body-parts');
    if (!bar || !container) return;

    if (currentRecord.body.entries.length === 0) {
        bar.hidden = true;
        return;
    }

    bar.hidden = false;
    container.innerHTML = '';
    const entries = currentRecord.body.entries;

    entries.forEach((entry, index) => {
        const item = getItemById(entry.partId);
        if (!item) return;

        const pill = document.createElement('div');
        pill.className = 'body-part-pill';
        const selectBtn = document.createElement('button');
        selectBtn.type = 'button';
        selectBtn.className = 'body-part-pill-select';
        selectBtn.textContent = item.label;
        selectBtn.setAttribute('aria-pressed', String(entry.partId === currentBodyPartId));
        selectBtn.addEventListener('click', () => {
            currentBodyPartId = entry.partId;
            renderBodyParts();
            renderBodySensationsForPart();
            renderSelectedBodyPartsBar();
            markCurrentRecordChanged();
        });

        const removeBtn = document.createElement('button');
        removeBtn.type = 'button';
        removeBtn.className = 'body-part-pill-remove';
        removeBtn.textContent = '×';
        removeBtn.setAttribute('aria-label', `${item.label}を削除`);
        removeBtn.addEventListener('click', () => {
            removeBodyEntry(entry.partId);
            if (currentBodyPartId === entry.partId) {
            const nextEntry = currentRecord.body.entries.find(candidate => candidate.partId !== entry.partId);
            currentBodyPartId = nextEntry ? nextEntry.partId : null;
            }
            updateBodyOrder();
            renderBodyParts();
            renderBodySensationsForPart();
            renderSelectedBodyPartsBar();
            const nextSelect = container.querySelector('.body-part-pill-select');
            const bodyChoice = document.querySelector('#container-body-parts .option-chip');
            (nextSelect || bodyChoice)?.focus();
            markCurrentRecordChanged();
        });
        pill.append(selectBtn, removeBtn);
        container.appendChild(pill);
    });
}

function renderBodyParts() {
    const selectedParts = currentRecord.body.entries.map(e => ({ itemId: e.partId }));
    renderGroupedOptions('container-body-parts', 'bodyPart', selectedParts, {
        showStrength: false, // 部位には強さを出さない
        currentActiveId: currentBodyPartId,
        showRemoveButton: true,
        onSelectedClick: (itemId) => {
            currentBodyPartId = itemId;
            renderBodyParts();
            renderBodySensationsForPart();
            renderSelectedBodyPartsBar();
        },
        onSelect: (itemId) => {
            ensureBodyEntry(itemId);
            currentBodyPartId = itemId;
            updateBodyOrder();
            renderBodyParts();
            renderBodySensationsForPart();
            renderSelectedBodyPartsBar();
        },
        onRemove: (itemId) => {
            removeBodyEntry(itemId);
            if (currentBodyPartId === itemId) {
                const nextEntry = currentRecord.body.entries[0];
                currentBodyPartId = nextEntry ? nextEntry.partId : null;
            }
            updateBodyOrder();
            renderBodyParts();
            renderBodySensationsForPart();
            renderSelectedBodyPartsBar();
        }
    });
    updateFloatingNavForView('view-step2-body');
}

function renderBodySensationsForPart() {
    const section = document.getElementById('body-sensations-section');
    if (!section) return;

    if (!currentBodyPartId) {
        section.hidden = true;
        updateFloatingNavForView('view-step2-body');
        return;
    }

    section.hidden = false;
    const partNameEl = document.getElementById('current-body-part-name');
    const partItem = getItemById(currentBodyPartId);
    if (partNameEl) partNameEl.textContent = partItem ? partItem.label : '不明な部位';

    const entry = getBodyEntry(currentBodyPartId);
    if (!entry) return;

    renderGroupedOptions('container-body-sensations', 'bodySensation', entry.sensations, {
        showStrength: true,
        scaleType: 'intensity',
        uniqueByLabel: true, // 同じラベルの項目を重複表示させない
        filterFn: (item) => {
            if (!item.appliesToParts || item.appliesToParts.length === 0) return true;
            return item.appliesToParts.includes(currentBodyPartId);
        },
        onSelect: (itemId, strength) => {
            entry.sensations.push({ itemId, strength });
            renderBodySensationsForPart();
        },
        onRemove: (itemId) => {
            entry.sensations = entry.sensations.filter(i => i.itemId !== itemId);
            renderBodySensationsForPart();
        },
        onChangeStrength: (itemId, strength) => {
            const item = entry.sensations.find(i => i.itemId === itemId);
            if (item) item.strength = strength;
            renderBodySensationsForPart();
        }
    });
    updateFloatingNavForView('view-step2-body');
}

function renderNextActions() {
    renderGroupedOptions('container-action-options', 'action', currentRecord.nextActions, {
        showStrength: true,
        scaleType: 'feasibility',
        onSelect: (itemId, strength) => {
            currentRecord.nextActions.push({ itemId, strength });
            renderNextActions();
        },
        onRemove: (itemId) => {
            currentRecord.nextActions = currentRecord.nextActions.filter(i => i.itemId !== itemId);
            renderNextActions();
        },
        onChangeStrength: (itemId, strength) => {
            const item = currentRecord.nextActions.find(i => i.itemId === itemId);
            if (item) item.strength = strength;
            renderNextActions();
        }
    });
    updateFloatingNavForView('view-step5-action');
}

function updateCardIndicators() {
    const updateText = (elementId, count) => {
        const el = document.getElementById(elementId);
        if (el) {
            el.textContent = count > 0 ? `${count}件選択` : '未選択';
        }
    };

    updateText('status-external', currentRecord.externalFactors.length);
    updateText('status-mind', currentRecord.mindNotifications.length);
    const bodyCount = currentRecord.body.entries.length;
    updateText('status-body', bodyCount);
}

/* ========================================
   7. 文章生成と確認
======================================== */
function getItemById(itemId) {
    return appState.items.find(item => item.id === itemId);
}

function getSelectedLabels(selectedArray) {
    return selectedArray.map(selection => {
        const item = getItemById(selection.itemId);
        return {
            label: item ? item.label : '不明な項目',
            strength: selection.strength
        };
    });
}

// 過去の記録用：スナップショットを優先してラベルを取得する関数
function getRecordSelectedLabels(record, selectedArray) {
    return selectedArray.map(selection => {
        let label = '不明な項目';
        if (record.itemSnapshot && record.itemSnapshot[selection.itemId]) {
            label = record.itemSnapshot[selection.itemId].label;
        } else {
            const item = getItemById(selection.itemId);
            if (item) {
                label = item.label;
            }
        }
        return {
            label: label,
            strength: selection.strength
        };
    });
}

// 強さでグループ化してDOMを生成する関数 (保存済み・作成中両対応)
function createStrengthGroupedDOM(itemsWithLabels, scaleType = 'intensity') {
    const wrapper = document.createElement('div');

    let groups = {};
    if (scaleType === 'feasibility') {
        groups = {
            strong: { label: '◎ やる', items: itemsWithLabels.filter(i => i.strength === 'strong') },
            some: { label: '○ できそう', items: itemsWithLabels.filter(i => i.strength === 'some' || !i.strength) },
            slight: { label: '△ 少しできそう', items: itemsWithLabels.filter(i => i.strength === 'slight') }
        };
    } else {
        groups = {
            strong: { label: '◎ 強い', items: itemsWithLabels.filter(i => i.strength === 'strong') },
            some: { label: '○ ある', items: itemsWithLabels.filter(i => i.strength === 'some' || !i.strength) },
            slight: { label: '△ 少し', items: itemsWithLabels.filter(i => i.strength === 'slight') }
        };
    }

    ['strong', 'some', 'slight'].forEach(key => {
        if (groups[key].items.length > 0) {
            const groupDiv = document.createElement('div');
            groupDiv.className = 'strength-group';

            const titleDiv = document.createElement('strong');
            titleDiv.textContent = groups[key].label;
            groupDiv.appendChild(titleDiv);

            const ul = document.createElement('ul');
            groups[key].items.forEach(item => {
                const li = document.createElement('li');
                li.textContent = item.label;
                ul.appendChild(li);
            });
            groupDiv.appendChild(ul);
            wrapper.appendChild(groupDiv);
        }
    });

    if (wrapper.childNodes.length === 0) {
        wrapper.textContent = '未選択';
    }

    return wrapper;
}

// 身体感覚の部位と感覚をフラットな配列にする (表示用)
function getBodySensationsWithLabels(record) {
    const list = [];
    if (!record.body || !record.body.entries) return list;

    record.body.entries.forEach(entry => {
        // ラベル取得は過去記録も考慮
        const partLabel = record.itemSnapshot && record.itemSnapshot[entry.partId] ?
            record.itemSnapshot[entry.partId].label : (getItemById(entry.partId)?.label || '不明な部位');

        if (entry.sensations && entry.sensations.length > 0) {
            entry.sensations.forEach(sens => {
                const sensLabel = record.itemSnapshot && record.itemSnapshot[sens.itemId] ?
                    record.itemSnapshot[sens.itemId].label : (getItemById(sens.itemId)?.label || '不明な感覚');
                list.push({
                    label: `${partLabel}：${sensLabel}`,
                    strength: sens.strength
                });
            });
        } else {
            list.push({
                label: `${partLabel}：気になっている`,
                strength: 'some'
            });
        }
    });
    return list;
}

function generateSummaryText() {
    let summaryParts = [];

    // 行動のサイン
    if (currentRecord.behaviorSigns.length > 0) {
        const behaviors = getSelectedLabels(currentRecord.behaviorSigns).map(s => s.label).join('、');
        summaryParts.push(`行動では、${behaviors} というサインがあります。`);
    }

    // 選ばれた順番で処理
    currentRecord.selectedOrder.forEach(category => {
        if (category === 'external' && currentRecord.externalFactors.length > 0) {
            const externals = getSelectedLabels(currentRecord.externalFactors).map(s => s.label).join('、');
            summaryParts.push(`影響していそうな条件として、${externals} があります。`);
        }
        else if (category === 'mind' && currentRecord.mindNotifications.length > 0) {
            const minds = getSelectedLabels(currentRecord.mindNotifications).map(s => `「${s.label}」`).join('、');
            summaryParts.push(`頭の中では、${minds} という通知が来ています。`);
        }
        else if (category === 'body' && currentRecord.body.entries.length > 0) {
            const bodyLabels = getBodySensationsWithLabels(currentRecord);
            let bodyTextParts = [];
            const strongItems = bodyLabels.filter(i => i.strength === 'strong');
            const someItems = bodyLabels.filter(i => i.strength === 'some' || !i.strength);
            const slightItems = bodyLabels.filter(i => i.strength === 'slight');

            if (strongItems.length > 0) {
                bodyTextParts.push(`◎ 強い\n${strongItems.map(i => `・${i.label}`).join('\n')}`);
            }
            if (someItems.length > 0) {
                bodyTextParts.push(`○ ある\n${someItems.map(i => `・${i.label}`).join('\n')}`);
            }
            if (slightItems.length > 0) {
                bodyTextParts.push(`△ 少し\n${slightItems.map(i => `・${i.label}`).join('\n')}`);
            }

            if (bodyTextParts.length > 0) {
                summaryParts.push(`体では、次のような感じがあります。\n\n${bodyTextParts.join('\n\n')}`);
            }
        }
    });

    summaryParts.push("今は、別のやり方を選ぶと動きやすくなるかもしれません。");
    return summaryParts.join('\n\n');
}

function renderSummary() {
    currentRecord.summaryText = generateSummaryText();
    const container = document.getElementById('container-summary-text');
    if (container) {
        container.textContent = currentRecord.summaryText;
    }
}

function renderReview() {
    const summaryContainer = document.getElementById('review-summary-text');
    if (summaryContainer) {
        summaryContainer.textContent = currentRecord.summaryText || "";
    }

    const actionContainer = document.getElementById('review-next-action');
    if (actionContainer) {
        actionContainer.innerHTML = '';
        if (currentRecord.nextActions.length > 0) {
            const labelsWithStrength = getSelectedLabels(currentRecord.nextActions);
            // 次の一手はfeasibilityスケールで表示
            actionContainer.appendChild(createStrengthGroupedDOM(labelsWithStrength, 'feasibility'));
        } else {
            actionContainer.textContent = '未選択';
        }
    }
}

/* ========================================
   8. 記録の保存・一覧・詳細表示
======================================== */

// 日付フォーマット関数
function formatDate(isoString) {
    const d = new Date(isoString);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const hh = String(d.getHours()).padStart(2, '0');
    const min = String(d.getMinutes()).padStart(2, '0');
    return `${yyyy}/${mm}/${dd} ${hh}:${min}`;
}

// 記録を作成
function createRecordFromCurrent() {
    const record = JSON.parse(JSON.stringify(currentRecord));
    record.id = `record_${Date.now()}`;
    record.createdAt = new Date().toISOString();

    // スナップショットの作成（項目編集による過去の記録の意図せぬ変更を防ぐため）
    const itemIds = new Set();
    const collectIds = (arr) => arr.forEach(a => itemIds.add(a.itemId));

    collectIds(record.behaviorSigns);
    collectIds(record.externalFactors);
    collectIds(record.mindNotifications);
    if (record.body && record.body.entries) {
        record.body.entries.forEach(entry => {
            itemIds.add(entry.partId);
            collectIds(entry.sensations);
        });
    }
    collectIds(record.nextActions);

    record.itemSnapshot = {};
    itemIds.forEach(id => {
        const item = getItemById(id);
        if (item) {
            record.itemSnapshot[id] = {
                label: item.label,
                category: item.category,
                group: item.group
            };
        }
    });

    return record;
}

// 記録を保存
function saveCurrentRecord() {
    const previousRecords = appState.records;
    const newRecord = createRecordFromCurrent();
    appState.records = [newRecord, ...previousRecords];
    if (!saveState()) {
        flushCurrentDraftSave();
        return false;
    }
    if (!clearCurrentDraftAfterSave()) {
        // The record is durable; keep the old draft rather than writing an
        // empty replacement when cleanup fails.
        currentDraftId = null;
        currentDraftSourceId = null;
        currentDraftSourceUpdatedAt = null;
    }
    resetCurrentRecord();
    return true;
}

// 記録を削除
function deleteRecord(recordId) {
    if (confirm("この記録を削除してもよろしいですか？")) {
        appState.records = appState.records.filter(r => r.id !== recordId);
        if (!saveState()) return false;
        selectedExportRecordIds.delete(recordId);
        updateSelectedExportState();
        return true;
    }
    return false;
}

// 記録一覧の描画
function renderRecordsList() {
    const container = document.getElementById('container-records-list');
    if (!container) return;

    syncRecordFilterControls();

    container.innerHTML = '';

    const totalCount = Array.isArray(appState.records) ? appState.records.length : 0;
    const filteredRecords = getFilteredRecords();

    updateRecordFilterResultNote(filteredRecords.length, totalCount);

    if (totalCount === 0) {
        const emptyMsg = document.createElement('p');
        emptyMsg.textContent = 'まだ記録はありません。';
        container.appendChild(emptyMsg);
        selectedExportRecordIds.clear();
        updateSelectedExportState();
        return;
    }

    if (filteredRecords.length === 0) {
        const emptyMsg = document.createElement('p');
        emptyMsg.textContent = '検索条件に合う記録はありません。';
        container.appendChild(emptyMsg);
        selectedExportRecordIds.clear();
        updateSelectedExportState();
        return;
    }

    filteredRecords.forEach(record => {
        const itemDiv = document.createElement('div');
        itemDiv.className = 'list-item';

        const selectRowDiv = document.createElement('label');
        selectRowDiv.className = 'record-select-row';

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.checked = selectedExportRecordIds.has(record.id);
        checkbox.addEventListener('change', (e) => {
            if (e.target.checked) {
                selectedExportRecordIds.add(record.id);
            } else {
                selectedExportRecordIds.delete(record.id);
            }
            updateSelectedExportState();
        });

        const selectLabelSpan = document.createElement('span');
        selectLabelSpan.textContent = 'この記録を選択';

        selectRowDiv.appendChild(checkbox);
        selectRowDiv.appendChild(selectLabelSpan);

        const headerDiv = document.createElement('div');
        headerDiv.className = 'record-item-header';

        const dateSpan = document.createElement('span');
        dateSpan.className = 'record-item-date';
        dateSpan.textContent = formatDate(record.createdAt);

        const levelSpan = document.createElement('span');
        levelSpan.className = 'record-item-level';
        levelSpan.textContent = `モヤリ度: ${record.moyariLevel}`;

        headerDiv.appendChild(dateSpan);
        headerDiv.appendChild(levelSpan);

        const contentDiv = document.createElement('div');
        contentDiv.className = 'record-item-summary';

        let behaviorText = '行動のサイン: 未選択';
        if (record.behaviorSigns && record.behaviorSigns.length > 0) {
            const firstItemId = record.behaviorSigns[0].itemId;
            let label = '不明';
            if (record.itemSnapshot && record.itemSnapshot[firstItemId]) {
                label = record.itemSnapshot[firstItemId].label;
            } else {
                const item = getItemById(firstItemId);
                if (item) label = item.label;
            }
            behaviorText = `行動: ${label} など`;
        }

        let actionText = '次の一手: 未選択';
        if (record.nextActions && record.nextActions.length > 0) {
            const firstItemId = record.nextActions[0].itemId;
            let label = '不明';
            if (record.itemSnapshot && record.itemSnapshot[firstItemId]) {
                label = record.itemSnapshot[firstItemId].label;
            } else {
                const item = getItemById(firstItemId);
                if (item) label = item.label;
            }
            actionText = `一手: ${label} など`;
        }

        const bP = document.createElement('div');
        bP.textContent = behaviorText;

        const aP = document.createElement('div');
        aP.textContent = actionText;

        contentDiv.appendChild(bP);
        contentDiv.appendChild(aP);

        const actionsDiv = document.createElement('div');
        actionsDiv.className = 'record-list-actions';

        const detailBtn = document.createElement('button');
        detailBtn.textContent = '詳細を見る';
        detailBtn.className = 'record-detail-button';
        detailBtn.addEventListener('click', () => {
            renderRecordDetail(record.id);
            switchView('view-record-detail');
        });

        const deleteBtn = document.createElement('button');
        deleteBtn.textContent = '削除';
        deleteBtn.className = 'record-delete-button';
        deleteBtn.addEventListener('click', () => {
            if (deleteRecord(record.id)) {
                renderRecordsList();
            }
        });

        actionsDiv.appendChild(detailBtn);
        actionsDiv.appendChild(deleteBtn);

        itemDiv.appendChild(selectRowDiv);
        itemDiv.appendChild(headerDiv);
        itemDiv.appendChild(contentDiv);
        itemDiv.appendChild(actionsDiv);

        container.appendChild(itemDiv);
    });

    updateSelectedExportState();
}

// 記録詳細の描画
function renderRecordDetail(recordId) {
    const record = appState.records.find(r => r.id === recordId);
    if (!record) return;

    currentDetailRecord = record;

    const container = document.getElementById('container-record-detail-content');
    if (!container) return;

    container.innerHTML = '';

    const createSection = (title, contentDOM) => {
        const section = document.createElement('div');
        section.className = 'detail-section';

        const h3 = document.createElement('h3');
        h3.className = 'detail-section-title';
        h3.textContent = title;
        section.appendChild(h3);

        if (typeof contentDOM === 'string') {
            const p = document.createElement('div');
            p.style.whiteSpace = 'pre-wrap';
            p.textContent = contentDOM;
            section.appendChild(p);
        } else {
            section.appendChild(contentDOM);
        }

        return section;
    };

    container.appendChild(createSection('日時', formatDate(record.createdAt)));
    container.appendChild(createSection('モヤリ度', record.moyariLevel.toString()));
    container.appendChild(createSection('まとめ文', record.summaryText || 'なし'));

    // 選択項目
    const selectedContentWrapper = document.createElement('div');

    if (record.behaviorSigns.length > 0) {
        const h = document.createElement('h4');
        h.textContent = '【行動のサイン】';
        h.style.marginTop = '0.5em';
        selectedContentWrapper.appendChild(h);

        const ul = document.createElement('ul');
        ul.style.listStyleType = 'none';
        ul.style.paddingLeft = '1em';
        getRecordSelectedLabels(record, record.behaviorSigns).forEach(s => {
            const li = document.createElement('li');
            li.textContent = `・${s.label}`;
            ul.appendChild(li);
        });
        selectedContentWrapper.appendChild(ul);
    }

    record.selectedOrder.forEach(category => {
        if (category === 'external' && record.externalFactors.length > 0) {
            const h = document.createElement('h4');
            h.textContent = '【影響していそうな条件】';
            h.style.marginTop = '0.5em';
            selectedContentWrapper.appendChild(h);
            const dom = createStrengthGroupedDOM(getRecordSelectedLabels(record, record.externalFactors), 'intensity');
            selectedContentWrapper.appendChild(dom);
        }
        if (category === 'mind' && record.mindNotifications.length > 0) {
            const h = document.createElement('h4');
            h.textContent = '【頭の中の通知】';
            h.style.marginTop = '0.5em';
            selectedContentWrapper.appendChild(h);
            const dom = createStrengthGroupedDOM(getRecordSelectedLabels(record, record.mindNotifications), 'intensity');
            selectedContentWrapper.appendChild(dom);
        }
        if (category === 'body' && record.body && record.body.entries && record.body.entries.length > 0) {
            const h = document.createElement('h4');
            h.textContent = '【身体感覚】';
            h.style.marginTop = '0.5em';
            selectedContentWrapper.appendChild(h);
            const dom = createStrengthGroupedDOM(getBodySensationsWithLabels(record), 'intensity');
            selectedContentWrapper.appendChild(dom);
        }
    });

    if (selectedContentWrapper.childNodes.length > 0) {
        container.appendChild(createSection('選択項目', selectedContentWrapper));
    }

    let nextActionsDOM = document.createElement('div');
    if (record.nextActions && record.nextActions.length > 0) {
        // 次の一手はfeasibilityスケールで表示
        nextActionsDOM = createStrengthGroupedDOM(getRecordSelectedLabels(record, record.nextActions), 'feasibility');
    } else {
        nextActionsDOM.textContent = '未選択';
    }
    container.appendChild(createSection('次の一手', nextActionsDOM));
}

/* ========================================
   10. 項目編集 (第6段階)
======================================== */

// アイテムが過去の記録で使用されているかを判定
function isItemUsedInRecords(itemId) {
    if (!appState || !appState.records) return false;

    for (const record of appState.records) {
        if (record.behaviorSigns?.some(i => i.itemId === itemId)) return true;
        if (record.externalFactors?.some(i => i.itemId === itemId)) return true;
        if (record.mindNotifications?.some(i => i.itemId === itemId)) return true;
        if (record.nextActions?.some(i => i.itemId === itemId)) return true;
        if (record.body && record.body.entries) {
            for (const entry of record.body.entries) {
                if (entry.partId === itemId) return true;
                if (entry.sensations?.some(i => i.itemId === itemId)) return true;
            }
        }
    }
    return false;
}

// 項目編集画面のリスト描画
function renderEditItems() {
    const categorySelect = document.getElementById('select-edit-category');
    const container = document.getElementById('container-edit-list');

    if (!categorySelect || !container) return;

    const targetCategory = categorySelect.value;
    container.innerHTML = '';

    const items = appState.items.filter(item => item.category === targetCategory);

    if (items.length === 0) {
        const emptyP = document.createElement('p');
        emptyP.textContent = '項目がありません。';
        container.appendChild(emptyP);
        return;
    }

    items.forEach(item => {
        const itemDiv = document.createElement('div');
        itemDiv.className = 'edit-item-card';

        // --- ヘッダー領域 ---
        const headerDiv = document.createElement('div');
        headerDiv.className = 'edit-item-header';

        const infoDiv = document.createElement('div');
        infoDiv.className = 'edit-item-info';

        const nameSpan = document.createElement('span');
        nameSpan.className = 'edit-item-name';
        nameSpan.textContent = item.label;
        if (item.isHidden) {
            nameSpan.classList.add('is-hidden');
        }

        const badgesDiv = document.createElement('div');
        badgesDiv.className = 'edit-item-badges';

        const groupSpan = document.createElement('span');
        groupSpan.className = 'edit-item-badge badge-group';
        groupSpan.textContent = item.group;

        const typeSpan = document.createElement('span');
        typeSpan.className = item.isDefault ? 'edit-item-badge badge-default' : 'edit-item-badge badge-custom';
        typeSpan.textContent = item.isDefault ? 'デフォルト' : '追加項目';

        const statusSpan = document.createElement('span');
        statusSpan.className = item.isHidden ? 'edit-item-badge badge-hidden' : 'edit-item-badge badge-visible';
        statusSpan.textContent = item.isHidden ? '非表示' : '表示中';

        badgesDiv.appendChild(groupSpan);
        badgesDiv.appendChild(typeSpan);
        badgesDiv.appendChild(statusSpan);

        infoDiv.appendChild(nameSpan);
        infoDiv.appendChild(badgesDiv);
        headerDiv.appendChild(infoDiv);

        // --- 操作ボタン領域 ---
        const actionsDiv = document.createElement('div');
        actionsDiv.className = 'edit-item-actions';

        const renameBtn = document.createElement('button');
        renameBtn.textContent = '名前変更';
        renameBtn.addEventListener('click', () => {
            const newName = prompt('新しい名前を入力してください（30文字以内）:', item.label);
            if (newName !== null) {
                const trimmed = newName.trim();
                if (!trimmed) {
                    showToast('項目名を入力してください');
                    return;
                }
                if (trimmed.length > 30) {
                    showToast('項目名は30文字以内で入力してください');
                    return;
                }
                item.label = trimmed;
                if (!saveState()) return;
                renderEditItems();
            }
        });

        const toggleBtn = document.createElement('button');
        toggleBtn.textContent = item.isHidden ? '表示に戻す' : '非表示にする';
        toggleBtn.addEventListener('click', () => {
            item.isHidden = !item.isHidden;
            if (!saveState()) return;
            renderEditItems();
        });

        actionsDiv.appendChild(renameBtn);
        actionsDiv.appendChild(toggleBtn);

        if (!item.isDefault) {
            const deleteBtn = document.createElement('button');
            deleteBtn.textContent = '削除';
            // 危険操作の汎用クラスを再利用
            deleteBtn.className = 'record-delete-button';
            deleteBtn.addEventListener('click', () => {
                if (isItemUsedInRecords(item.id)) {
                    if (confirm('この項目は過去の記録で使われています。記録の表示は保存時点の言葉で残りますが、今後の選択肢から外したいだけなら『非表示』がおすすめです。それでも削除しますか？')) {
                        appState.items = appState.items.filter(i => i.id !== item.id);
                        if (!saveState()) return;
                        renderEditItems();
                    }
                } else {
                    if (confirm('この項目を削除しますか？')) {
                        appState.items = appState.items.filter(i => i.id !== item.id);
                        if (!saveState()) return;
                        renderEditItems();
                    }
                }
            });
            actionsDiv.appendChild(deleteBtn);
        }

        itemDiv.appendChild(headerDiv);
        itemDiv.appendChild(actionsDiv);

        container.appendChild(itemDiv);
    });
}

// 初期項目を戻す機能
function restoreDefaultItems(category) {
    if (!confirm('現在のカテゴリのデフォルト項目を復元しますか？\n（ユーザー追加項目はそのまま残り、既存のデフォルト項目は表示状態に戻ります）')) {
        return;
    }

    const defaultItems = createDefaultItems().filter(item => item.category === category);

    defaultItems.forEach(defItem => {
        const existingItem = appState.items.find(i => i.id === defItem.id);
        if (existingItem) {
            // 既存のデフォルト項目は非表示状態を解除する（ラベルやappliesToPartsは維持）
            existingItem.isHidden = false;
        } else {
            // もし何らかの理由で削除されていたら再追加
            appState.items.push({
                ...defItem,
                createdAt: new Date().toISOString()
            });
        }
    });

    if (!saveState()) return;
    renderEditItems();
    showToast('初期項目を復元しました');
}

/* ========================================
   11. 初期化とイベントの接続
======================================== */
function initApp() {
    loadState();

    setupEventListeners();
    document.querySelectorAll('.view[id^="view-step"] .bottom-nav').forEach(nav => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'btn-draft-pause';
        button.textContent = '途中で休む';
        button.addEventListener('click', () => {
            if (!flushCurrentDraftSave()) return;
            clearTimeout(currentDraftTimer);
            currentDraftId = null;
            currentDraftSourceId = null;
            resetCurrentRecord();
            renderCurrentDraftCandidates();
            switchView('view-home');
        });
        nav.appendChild(button);
    });

    // 初回ガイドの表示判定
    if (!appState.hasSeenGuide) {
        switchView('view-guide');
    } else {
        switchView('view-home');
        checkAppUpdate();
    }
}

function setupEventListeners() {
    // --- 初回ガイド ---
    document.getElementById('btn-guide-agree')?.addEventListener('click', () => {
        appState.hasSeenGuide = true;
        if (!saveState()) showToast('この起動中だけ利用できます。端末への保存はできません。');
        switchView('view-home');
    });

    // --- ホーム画面 ---
    document.getElementById('btn-home-start')?.addEventListener('click', () => {
        const candidates = readCurrentDraftCandidates();
        if (candidates.length && !confirm('保存済みの下書きは残したまま、新しい記録を始めますか？')) return;
        beginCurrentDraft();
        resetCurrentRecord();
        renderCurrentDraftCandidates();
        const slider = document.getElementById('input-moyari-level');
        const display = document.getElementById('display-moyari-level');
        if (slider && display) {
            slider.value = 0;
            display.textContent = '0';
        }

        renderBehaviorSigns();
        switchView('view-step1-behavior');
    });
    document.getElementById('btn-home-records')?.addEventListener('click', () => {
        renderRecordsList();
        switchView('view-records');
    });
    document.getElementById('btn-home-edit')?.addEventListener('click', () => {
        renderEditItems(); // 画面遷移前にリストを描画
        switchView('view-edit');
    });
    document.getElementById('btn-home-about')?.addEventListener('click', () => {
        openModal('modal-about');
    });

    // --- Step 1: 行動 ---
    document.getElementById('btn-step1-back')?.addEventListener('click', () => {
        if (!confirmDiscardDraft()) return;
        if (!discardCurrentDraft()) return;
        switchView('view-home');
    });
    document.getElementById('btn-step1-next')?.addEventListener('click', () => {
        updateCardIndicators();
        switchView('view-step2-cards');
    });

    // --- Step 2: 並列カード ---
    document.getElementById('btn-step2-back')?.addEventListener('click', () => {
        switchView('view-step1-behavior');
    });
    document.getElementById('btn-step2-next')?.addEventListener('click', () => {
        switchView('view-step3-level');
    });
    document.getElementById('card-external')?.addEventListener('click', () => {
        renderExternalFactors();
        switchView('view-step2-external');
    });
    document.getElementById('card-mind')?.addEventListener('click', () => {
        renderMindNotifications();
        switchView('view-step2-mind');
    });
    document.getElementById('card-body')?.addEventListener('click', () => {
        renderBodyParts();
        renderSelectedBodyPartsBar();
        renderBodySensationsForPart();
        switchView('view-step2-body');
    });

    // --- Step 2 サブビューの戻る処理 (ヘッダーへ移動) ---
    document.getElementById('btn-external-done')?.addEventListener('click', () => {
        updateCardIndicators();
        switchView('view-step2-cards');
    });
    document.getElementById('btn-mind-done')?.addEventListener('click', () => {
        updateCardIndicators();
        switchView('view-step2-cards');
    });
    document.getElementById('btn-body-done')?.addEventListener('click', () => {
        updateCardIndicators();
        switchView('view-step2-cards');
    });

    // --- Step 3: モヤリ度 ---
    const slider = document.getElementById('input-moyari-level');
    const display = document.getElementById('display-moyari-level');
    if (slider && display) {
        slider.addEventListener('input', (e) => {
            const val = parseInt(e.target.value, 10);
            currentRecord.moyariLevel = val;
            display.textContent = val;
            markCurrentRecordChanged();
        });
    }

    document.getElementById('btn-step3-back')?.addEventListener('click', () => {
        updateCardIndicators(); // 戻った時に表示がずれないよう更新
        switchView('view-step2-cards');
    });
    document.getElementById('btn-step3-next')?.addEventListener('click', () => {
        renderSummary();
        switchView('view-step4-summary');
    });

    // --- Step 4: まとめ確認 ---
    document.getElementById('btn-step4-back')?.addEventListener('click', () => {
        switchView('view-step3-level');
    });
    document.getElementById('btn-step4-next')?.addEventListener('click', () => {
        renderNextActions();
        switchView('view-step5-action');
    });

    // --- Step 5: 次の一手 ---
    document.getElementById('btn-step5-back')?.addEventListener('click', () => {
        switchView('view-step4-summary');
    });
    document.getElementById('btn-step5-next')?.addEventListener('click', () => {
        renderReview();
        switchView('view-step6-save');
    });

    // --- Step 6: 保存 ---
    document.getElementById('btn-step6-back')?.addEventListener('click', () => {
        switchView('view-step5-action');
    });
    document.getElementById('btn-save-record')?.addEventListener('click', () => {
        if (!saveCurrentRecord()) return;
        showToast("記録を保存しました");
        switchView('view-home');
    });
    document.getElementById('btn-discard-record')?.addEventListener('click', () => {
        if (!confirmDiscardDraft()) return;
        if (!discardCurrentDraft()) return;
        switchView('view-home');
    });

    // --- 記録一覧・詳細・エクスポート ---
    document.getElementById('btn-records-home')?.addEventListener('click', () => {
        switchView('view-home');
    });
    document.getElementById('btn-detail-back')?.addEventListener('click', () => {
        switchView('view-records');
    });
    document.getElementById('btn-detail-delete')?.addEventListener('click', () => {
        if (!currentDetailRecord) return;
        if (deleteRecord(currentDetailRecord.id)) {
            currentDetailRecord = null;
            renderRecordsList();
            switchView('view-records');
        }
    });

    // 詳細画面からの1件エクスポート
    document.getElementById('btn-detail-export')?.addEventListener('click', () => {
        if (!currentDetailRecord) return;
        const text = generateRecordExportText(currentDetailRecord);
        const filename = `moyarihat_${formatDateForFilename(currentDetailRecord.createdAt)}.txt`;
        const success = downloadTextFile(filename, text);
        if (success) {
            showToast('記録を書き出しました');
        } else {
            copyTextToClipboard(text, '書き出しに失敗したため、内容をコピーしました');
        }
    });

    // 一覧画面からの全件エクスポート
    document.getElementById('btn-export-all-records')?.addEventListener('click', () => {
        if (!appState.records || appState.records.length === 0) {
            showToast('書き出す記録がありません');
            return;
        }
        const text = generateAllRecordsExportText();
        const filename = `moyarihat_all_${formatDateForFilename(new Date().toISOString())}.txt`;
        const success = downloadTextFile(filename, text);
        if (success) {
            showToast('すべての記録を書き出しました');
        } else {
            copyTextToClipboard(text, '書き出しに失敗したため、内容をコピーしました');
        }
    });

    // 一覧画面からの選択件エクスポート
    document.getElementById('btn-export-selected-records')?.addEventListener('click', () => {
        const selectedRecords = appState.records.filter(r => selectedExportRecordIds.has(r.id));
        if (selectedRecords.length === 0) {
            showToast('書き出す記録が選択されていません');
            return;
        }
        const text = generateSelectedRecordsExportText(selectedRecords);
        const filename = `moyarihat_selected_${formatDateForFilename(new Date().toISOString())}.txt`;
        const success = downloadTextFile(filename, text);
        if (success) {
            showToast('選択した記録を書き出しました');
        } else {
            copyTextToClipboard(text, '書き出しに失敗したため、内容をコピーしました');
        }
    });

    // 記録一覧のフィルター操作
    document.getElementById('input-record-search')?.addEventListener('input', () => {
        readRecordFilterControls();
        selectedExportRecordIds.clear();
        renderRecordsList();
    });

    document.getElementById('select-record-level-filter')?.addEventListener('change', () => {
        readRecordFilterControls();
        selectedExportRecordIds.clear();
        renderRecordsList();
    });

    document.getElementById('select-record-sort')?.addEventListener('change', () => {
        readRecordFilterControls();
        selectedExportRecordIds.clear();
        renderRecordsList();
    });

    document.getElementById('btn-clear-record-filters')?.addEventListener('click', () => {
        clearRecordFilters();
    });

    document.getElementById('btn-detail-consult-copy')?.addEventListener('click', () => {
        openConsultCopyModal();
    });

    document.getElementById('btn-consult-copy-cancel')?.addEventListener('click', () => {
        closeConsultCopyModal();
    });

    document.getElementById('btn-consult-copy-run')?.addEventListener('click', () => {
        copyConsultMemo();
    });

    // フローティングナビの開閉処理
    document.querySelectorAll('[data-floating-menu-toggle]').forEach(toggleBtn => {
        toggleBtn.addEventListener('click', (e) => {
            const currentNav = e.currentTarget.closest('[data-floating-nav]');
            if (!currentNav) return;

            const currentPanel = currentNav.querySelector('.floating-nav-panel');
            if (!currentPanel) return;

            // 他のパネルを閉じる
            document.querySelectorAll('.floating-nav-panel').forEach(panel => {
                if (panel !== currentPanel) {
                    panel.hidden = true;
                    panel.querySelectorAll('button').forEach(btn => btn.blur());
                }
            });

            const willOpen = currentPanel.hidden;
            currentPanel.hidden = !currentPanel.hidden;

            e.currentTarget.blur();

            if (willOpen) {
                currentPanel.scrollTop = 0;
                currentPanel.querySelectorAll('button').forEach(btn => btn.blur());
            }
        });
    });

    // フローティングナビの「上へ」ボタン (閉じる処理を追加)
    document.querySelectorAll('[data-scroll-top]').forEach(button => {
        button.addEventListener('click', (e) => {
            window.scrollTo({ top: 0, behavior: 'smooth' });

            e.currentTarget.blur();

            const currentNav = e.currentTarget.closest('[data-floating-nav]');
            if (currentNav) {
                const currentPanel = currentNav.querySelector('.floating-nav-panel');
                if (currentPanel) {
                    currentPanel.querySelectorAll('button').forEach(btn => btn.blur());
                    currentPanel.hidden = true;
                }
            }
        });
    });

    // --- 項目編集 ---
    document.getElementById('btn-edit-home')?.addEventListener('click', () => {
        switchView('view-home');
    });
    document.getElementById('select-edit-category')?.addEventListener('change', () => {
        renderEditItems();
    });

    // 項目編集画面からの新規追加
    document.getElementById('btn-edit-add-item')?.addEventListener('click', () => {
        const categorySelect = document.getElementById('select-edit-category');
        if (!categorySelect) return;
        openAddItemModal(categorySelect.value, 'ユーザー追加', () => {
            renderEditItems(); // 今回の記録には追加せず、再描画のみ行う
        });
    });

    // 初期項目を戻すボタン
    const resetBtnIds = ['btn-reset-default', 'btn-restore-default', 'btn-reset-items', 'btn-edit-reset', 'btn-restore-items'];
    resetBtnIds.forEach(id => {
        document.getElementById(id)?.addEventListener('click', () => {
            const categorySelect = document.getElementById('select-edit-category');
            if (categorySelect) {
                restoreDefaultItems(categorySelect.value);
            }
        });
    });

    // --- モーダルの操作 ---
    document.getElementById('btn-about-close')?.addEventListener('click', () => {
        closeModal('modal-about');
    });
    document.getElementById('btn-modal-cancel')?.addEventListener('click', () => {
        closeAddItemModal();
    });

    // 項目追加ボタンの処理
    document.getElementById('btn-modal-add')?.addEventListener('click', () => {
        if (!currentAddItemContext) return;

        const input = document.getElementById('input-add-item-name');
        if (!input) return;

        const label = input.value.trim();

        if (!label) {
            showToast('項目名を入力してください');
            return;
        }

        if (label.length > 30) {
            showToast('項目名は30文字以内で入力してください');
            return;
        }

        const newItem = addCustomItem(
            currentAddItemContext.category,
            currentAddItemContext.group,
            label
        );
        if (!saveState()) return;
        const callback = currentAddItemContext.afterAddCallback;
        closeAddItemModal(); // ここで currentAddItemContext = null になる

        if (callback) {
            callback(newItem.id);
            markCurrentRecordChanged();
        }
    });

    // 記録のクリアや項目のリセット

    document.getElementById('btn-clear-records')?.addEventListener('click', () => {
        clearRecordsFromSettings();
    });

    document.getElementById('btn-reset-items')?.addEventListener('click', () => {
        resetItemsFromSettings();
    });

    // バックアップJSONのエクスポート
    document.getElementById('btn-backup-json')?.addEventListener('click', () => {
        exportBackupJson();
    });
    // バックアップJSONのインポート
    document.getElementById('input-restore-json')?.addEventListener('change', handleRestoreFileSelected);
    document.getElementById('btn-restore-json')?.addEventListener('click', () => {
        restoreFromSelectedBackup();
    });

    // 全てリセットの確認モーダルの入力監視
    document.getElementById('confirm-reset-all-check')?.addEventListener('change', () => {
        updateResetAllButtonState();
    });

    document.getElementById('confirm-reset-all-text')?.addEventListener('input', () => {
        updateResetAllButtonState();
    });

    document.getElementById('btn-reset-all')?.addEventListener('click', () => {
        resetAllFromSettings();
    });

    // ガイドをもう一度表示
    document.getElementById('btn-show-guide-again')?.addEventListener('click', () => {
        showGuideAgainFromSettings();
    });

    // 診断結果のコピー
    document.getElementById('btn-copy-diagnostics')?.addEventListener('click', () => {
        copyDiagnostics();
    });

    // ハードリロード
    document.getElementById('btn-hard-reload')?.addEventListener('click', () => {
        hardReloadFromSettings();
    });

    document.getElementById('btn-clear-cache-reload')?.addEventListener('click', () => {
        clearCacheAndReload();
    });

    // チェンジログの表示
    document.getElementById('btn-show-changelog')?.addEventListener('click', () => {
        showChangelogModal();
    });

    document.getElementById('btn-changelog-close')?.addEventListener('click', () => {
        closeModal('modal-changelog');
    });

    // 各画面からの項目追加モーダル呼び出し
    document.getElementById('btn-add-behavior')?.addEventListener('click', () => {
        openAddItemModal('behavior', 'ユーザー追加', (itemId) => {
            currentRecord.behaviorSigns.push({ itemId, strength: 'some' });
            renderBehaviorSigns();
        });
    });
    document.getElementById('btn-add-external')?.addEventListener('click', () => {
        openAddItemModal('external', 'ユーザー追加', (itemId) => {
            currentRecord.externalFactors.push({ itemId, strength: 'some' });
            addToSelectedOrder('external');
            renderExternalFactors();
        });
    });
    document.getElementById('btn-add-mind')?.addEventListener('click', () => {
        openAddItemModal('mind', 'ユーザー追加', (itemId) => {
            currentRecord.mindNotifications.push({ itemId, strength: 'some' });
            addToSelectedOrder('mind');
            renderMindNotifications();
        });
    });
    document.getElementById('btn-add-body-part')?.addEventListener('click', () => {
        openAddItemModal('bodyPart', 'ユーザー追加', (itemId) => {
            ensureBodyEntry(itemId);
            currentBodyPartId = itemId;
            updateBodyOrder();
            renderBodyParts();
            renderBodySensationsForPart();
            renderSelectedBodyPartsBar();
        });
    });
    document.getElementById('btn-add-body-sensation')?.addEventListener('click', () => {
        if (!currentBodyPartId) {
            showToast('先に部位を選択してください');
            return;
        }
        openAddItemModal('bodySensation', 'ユーザー追加', (itemId) => {
            const entry = ensureBodyEntry(currentBodyPartId);
            entry.sensations.push({ itemId, strength: 'some' });
            renderBodySensationsForPart();
        });
    });
    document.getElementById('btn-add-action')?.addEventListener('click', () => {
        openAddItemModal('action', 'ユーザー追加', (itemId) => {
            currentRecord.nextActions.push({ itemId, strength: 'some' });
            renderNextActions();
        });
    });

    // Escapeキーでのモーダルキャンセル
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            const addItemModal = document.getElementById('modal-add-item');
            if (addItemModal && !addItemModal.hidden) {
                closeAddItemModal();
                return;
            }
            const aboutModal = document.getElementById('modal-about');
            if (aboutModal && !aboutModal.hidden) {
                closeModal('modal-about');
                return;
            }
            const changelogModal = document.getElementById('modal-changelog');
            if (changelogModal && !changelogModal.hidden) {
                closeModal('modal-changelog');
                return;
            }
            const consultCopyModal = document.getElementById('modal-consult-copy');
            if (consultCopyModal && !consultCopyModal.hidden) {
                closeConsultCopyModal();
                return;
            }
        }
    });

    document.getElementById('btn-home-settings')?.addEventListener('click', () => {
        renderSettingsView(); //
        switchView('view-settings');
    });
    document.getElementById('btn-settings-home')?.addEventListener('click', () => {
        switchView('view-home');
    });

}

// DOMの読み込みが完了したらアプリを初期化
document.addEventListener('DOMContentLoaded', initApp);