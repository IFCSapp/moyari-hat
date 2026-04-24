/**
 * モヤリハット - アプリケーションロジック (第7段階: UX改善と身体感覚の構造変更)
 */

/* ========================================
   1. 定数とlocalStorageキー
======================================== */
const STORAGE_KEY = 'MOYARIHAT_STATE_V1';
const APP_SCHEMA_VERSION = 3; // バージョン3へ引き上げ（body.entries構造へ変更）

// アプリの初期状態構造
const INITIAL_STATE = {
    schemaVersion: APP_SCHEMA_VERSION,
    hasSeenGuide: false,
    items: [], // 項目データ（デフォルト＋追加）
    records: [], // 記録データ
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
        { id: 'body_sensation_temp_hot', label: '熱い' },
        { id: 'body_sensation_temp_cold', label: '冷たい' },
        { id: 'body_sensation_temp_sweat', label: '汗ばむ' },
        { id: 'body_sensation_temp_facehot', label: '顔が熱い' },
        { id: 'body_sensation_temp_limbcold', label: '手足が冷える' }
    ]);
    addItems('bodySensation', '息・胸まわり', [
        { id: 'body_sensation_breath_shallow', label: '息が浅い' },
        { id: 'body_sensation_breath_chesttight', label: '胸がつまる' },
        { id: 'body_sensation_breath_chestheavy', label: '胸が重い' },
        { id: 'body_sensation_breath_throat', label: 'のどがつまる' },
        { id: 'body_sensation_breath_hard', label: '呼吸しづらい感じ' }
    ]);
    addItems('bodySensation', '感覚が薄い系', [
        { id: 'body_sensation_faint_blur', label: 'ぼんやりする' },
        { id: 'body_sensation_faint_far', label: '遠い感じ' },
        { id: 'body_sensation_faint_unreal', label: '実感が薄い' },
        { id: 'body_sensation_faint_white', label: '頭が白い' },
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
        return JSON.parse(JSON.stringify(INITIAL_STATE));
    }

    if (typeof state.hasSeenGuide !== 'boolean') state.hasSeenGuide = false;
    if (!Array.isArray(state.items)) state.items = [];
    if (!Array.isArray(state.records)) state.records = [];

    const currentVersion = typeof state.schemaVersion === 'number' ? state.schemaVersion : 1;

    // バージョン3未満の場合は身体感覚の構造が変わるため、古い記録はリセットしてスキーマを更新
    if (currentVersion < APP_SCHEMA_VERSION) {
        state.records = [];
        state.schemaVersion = APP_SCHEMA_VERSION;
    }

    if (state.items.length === 0) {
        state.items = createDefaultItems();
    }

    return state;
}

function loadState() {
    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
            const parsed = JSON.parse(stored);
            const oldVersion = parsed.schemaVersion || 1;

            appState = normalizeState(parsed);

            let needsSave = false;

            if (oldVersion < APP_SCHEMA_VERSION) {
                needsSave = true;
            }

            if (appState.items.length === 0) {
                appState.items = createDefaultItems();
                needsSave = true;
            }

            if (needsSave) {
                saveState();
            }
        } else {
            appState = JSON.parse(JSON.stringify(INITIAL_STATE));
            appState.items = createDefaultItems();
            saveState();
        }
    } catch (error) {
        console.error("状態の読み込みに失敗しました:", error);
        appState = JSON.parse(JSON.stringify(INITIAL_STATE));
        appState.items = createDefaultItems();
    }
}

function saveState() {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(appState));
    } catch (error) {
        console.error("状態の保存に失敗しました:", error);
        showToast("データの保存に失敗しました。端末の空き容量をご確認ください。");
    }
}

/* ========================================
   4. UI制御 (画面切り替え・モーダル・トースト・クリップボード)
======================================== */
function switchView(viewId) {
    document.querySelectorAll('.view').forEach(view => {
        view.hidden = true;
    });

    const targetView = document.getElementById(viewId);
    if (targetView) {
        targetView.hidden = false;
        window.scrollTo(0, 0);
    } else {
        console.error(`View not found: ${viewId}`);
    }
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

async function copyTextToClipboard(text) {
    if (!text) return;

    if (navigator.clipboard && navigator.clipboard.writeText) {
        try {
            await navigator.clipboard.writeText(text);
            showToast('共有文をコピーしました');
            return;
        } catch (err) {
            console.warn('Clipboard API failed, falling back to execCommand', err);
            // エラーの場合はフォールバック処理へと進む
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
            showToast('共有文をコピーしました');
        } else {
            showToast('コピーに失敗しました。テキストを選択してコピーしてください。');
        }
    } catch (err) {
        console.error('Fallback copy failed', err);
        showToast('コピーに失敗しました。テキストを選択してコピーしてください。');
    }
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
        isDefault: false,
        isHidden: false,
        createdAt: new Date().toISOString(),
        useCount: 0,
        lastUsedAt: null
    };
    appState.items.push(newItem);
    return newItem;
}

/* ========================================
   6. 描画と選択処理 (第2段階・第7段階改修)
======================================== */
function getVisibleItemsByCategory(category) {
    const items = appState.items.filter(item => item.category === category && !item.isHidden);
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

    const groupedItems = getVisibleItemsByCategory(category);

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
                if (isSelected) {
                    options.onRemove(item.id);
                } else {
                    options.onSelect(item.id, 'some');
                }
            });

            wrapper.appendChild(btn);

            if (options.showStrength && isSelected) {
                const strengthContainer = document.createElement('div');
                strengthContainer.className = 'strength-options';

                const strengths = [
                    { val: 'strong', label: '◎ 強い' },
                    { val: 'some', label: '○ ある' },
                    { val: 'slight', label: '△ 少し' }
                ];

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
}

function renderExternalFactors() {
    renderGroupedOptions('container-external-options', 'external', currentRecord.externalFactors, {
        showStrength: true,
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
}

function renderMindNotifications() {
    renderGroupedOptions('container-mind-options', 'mind', currentRecord.mindNotifications, {
        showStrength: true,
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
}

// --- 身体感覚の新しい描画ロジック ---
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

function renderBodyParts() {
    const selectedParts = currentRecord.body.entries.map(e => ({ itemId: e.partId }));
    renderGroupedOptions('container-body-parts', 'bodyPart', selectedParts, {
        showStrength: false, // 部位には強さを出さない
        currentActiveId: currentBodyPartId,
        onSelect: (itemId) => {
            ensureBodyEntry(itemId);
            currentBodyPartId = itemId;
            updateBodyOrder();
            renderBodyParts();
            renderBodySensationsForPart();
        },
        onRemove: (itemId) => {
            removeBodyEntry(itemId);
            if (currentBodyPartId === itemId) currentBodyPartId = null;
            updateBodyOrder();
            renderBodyParts();
            renderBodySensationsForPart();
        }
    });
}

function renderBodySensationsForPart() {
    const section = document.getElementById('body-sensations-section');
    if (!section) return;

    if (!currentBodyPartId) {
        section.hidden = true;
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
}

function renderNextActions() {
    renderGroupedOptions('container-action-options', 'action', currentRecord.nextActions, {
        showStrength: true,
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
   7. 文章生成と確認 (第3段階・第7段階改修)
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

// 強さテキスト化
function getStrengthText(strength) {
    switch (strength) {
        case 'strong': return '強く';
        case 'slight': return '少し';
        case 'some':
        default: return '';
    }
}

// 強さでグループ化してDOMを生成する関数 (保存済み・作成中両対応)
function createStrengthGroupedDOM(itemsWithLabels) {
    const wrapper = document.createElement('div');
    const groups = {
        strong: { label: '◎ 強い', items: itemsWithLabels.filter(i => i.strength === 'strong') },
        some: { label: '○ ある', items: itemsWithLabels.filter(i => i.strength === 'some' || !i.strength) },
        slight: { label: '△ 少し', items: itemsWithLabels.filter(i => i.strength === 'slight') }
    };

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
            let bodyPartsText = [];
            currentRecord.body.entries.forEach(entry => {
                const partLabel = getRecordSelectedLabels(currentRecord, [{ itemId: entry.partId, strength: 'some' }])[0].label;
                const sensationsLabels = getRecordSelectedLabels(currentRecord, entry.sensations).map(s => s.label).join('、');

                if (sensationsLabels) {
                    bodyPartsText.push(`・${partLabel}：${sensationsLabels}`);
                } else {
                    bodyPartsText.push(`・${partLabel}：気になっている`);
                }
            });
            if (bodyPartsText.length > 0) {
                summaryParts.push(`体では、次のような感じがあります。\n${bodyPartsText.join('\n')}`);
            }
        }
    });

    summaryParts.push("今は、次の一手を少し小さくするタイミングかもしれません。");
    return summaryParts.join('\n\n');
}

function generateShareText() {
    let parts = [];

    if (currentRecord.behaviorSigns.length > 0) {
        const behaviors = getSelectedLabels(currentRecord.behaviorSigns).map(s => s.label).join('や');
        parts.push(`今、${behaviors}などのサインが出ています。`);
    } else {
        parts.push(`今、少し動きが止まりそうです。`);
    }

    // 長くなりすぎるのを防ぐため、外的要因は含めず、行動、身体、頭の通知、次の一手を優先する
    currentRecord.selectedOrder.forEach(category => {
        if (category === 'body' && currentRecord.body.entries.length > 0) {
            let bodyTextParts = [];
            currentRecord.body.entries.forEach(entry => {
                const partLabel = getRecordSelectedLabels(currentRecord, [{ itemId: entry.partId, strength: 'some' }])[0].label;
                const sensationsLabels = getRecordSelectedLabels(currentRecord, entry.sensations).map(s => s.label).join('、');
                if (sensationsLabels) {
                    bodyTextParts.push(`${partLabel}に${sensationsLabels}感じ`);
                } else {
                    bodyTextParts.push(`${partLabel}が気になる感じ`);
                }
            });
            if (bodyTextParts.length > 0) {
                parts.push(`体では${bodyTextParts.join('や、')}があります。`);
            }
        }
        if (category === 'mind') {
            const mn = getSelectedLabels(currentRecord.mindNotifications).map(s => `「${s.label}」`).join('、');
            if (mn) parts.push(`頭の中では${mn}という通知が来ています。`);
        }
    });

    if (currentRecord.nextActions.length > 0) {
        const actions = getSelectedLabels(currentRecord.nextActions).map(s => s.label).join('か、');
        parts.push(`まず「${actions}」を試したいです。`);
    } else {
        parts.push(`まず、次の一手を小さくしたいです。`);
    }

    return parts.join('');
}

function renderSummary() {
    currentRecord.summaryText = generateSummaryText();
    const container = document.getElementById('container-summary-text');
    if (container) {
        container.textContent = currentRecord.summaryText;
    }
}

function renderReview() {
    currentRecord.shareText = generateShareText();

    const summaryContainer = document.getElementById('review-summary-text');
    if (summaryContainer) {
        summaryContainer.textContent = currentRecord.summaryText || "";
    }

    const actionContainer = document.getElementById('review-next-action');
    if (actionContainer) {
        actionContainer.innerHTML = '';
        if (currentRecord.nextActions.length > 0) {
            const labelsWithStrength = getSelectedLabels(currentRecord.nextActions);
            actionContainer.appendChild(createStrengthGroupedDOM(labelsWithStrength));
        } else {
            actionContainer.textContent = '未選択';
        }
    }

    const shareContainer = document.getElementById('review-share-text');
    if (shareContainer) {
        shareContainer.textContent = currentRecord.shareText;
    }
}

/* ========================================
   8. 記録の保存・一覧・詳細表示 (第4段階・第7段階改修)
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
    const newRecord = createRecordFromCurrent();
    appState.records.unshift(newRecord);
    saveState();
    currentRecord = JSON.parse(JSON.stringify(INITIAL_CURRENT_RECORD));
    currentBodyPartId = null; // リセット
}

// 記録を削除
function deleteRecord(recordId) {
    if (confirm("この記録を削除してもよろしいですか？")) {
        appState.records = appState.records.filter(r => r.id !== recordId);
        saveState();
        return true;
    }
    return false;
}

// 記録一覧の描画
function renderRecordsList() {
    const container = document.getElementById('container-records-list');
    if (!container) return;

    container.innerHTML = '';

    if (appState.records.length === 0) {
        const emptyMsg = document.createElement('p');
        emptyMsg.textContent = 'まだ記録はありません。';
        container.appendChild(emptyMsg);
        return;
    }

    appState.records.forEach(record => {
        const itemDiv = document.createElement('div');
        itemDiv.className = 'list-item';
        itemDiv.style.flexDirection = 'column';
        itemDiv.style.alignItems = 'flex-start';

        // ヘッダー情報（日付とモヤリ度）
        const headerDiv = document.createElement('div');
        headerDiv.style.display = 'flex';
        headerDiv.style.justifyContent = 'space-between';
        headerDiv.style.width = '100%';
        headerDiv.style.marginBottom = '0.5rem';

        const dateSpan = document.createElement('span');
        dateSpan.style.fontWeight = 'bold';
        dateSpan.textContent = formatDate(record.createdAt);

        const levelSpan = document.createElement('span');
        levelSpan.style.color = 'var(--color-primary)';
        levelSpan.style.fontWeight = 'bold';
        levelSpan.textContent = `モヤリ度: ${record.moyariLevel}`;

        headerDiv.appendChild(dateSpan);
        headerDiv.appendChild(levelSpan);

        // 概要のテキスト情報（スナップショット優先でラベル取得）
        const contentDiv = document.createElement('div');
        contentDiv.style.fontSize = '0.9rem';
        contentDiv.style.color = 'var(--color-text-light)';
        contentDiv.style.marginBottom = '0.5rem';

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

        // アクションボタン領域
        const actionsDiv = document.createElement('div');
        actionsDiv.style.display = 'flex';
        actionsDiv.style.gap = '0.5rem';
        actionsDiv.style.width = '100%';

        const detailBtn = document.createElement('button');
        detailBtn.textContent = '詳細を見る';
        detailBtn.style.flex = '1';
        detailBtn.addEventListener('click', () => {
            renderRecordDetail(record.id);
            switchView('view-record-detail');
        });

        const deleteBtn = document.createElement('button');
        deleteBtn.textContent = '削除';
        deleteBtn.style.backgroundColor = 'var(--color-error-bg)';
        deleteBtn.style.color = 'var(--color-error-text)';
        deleteBtn.style.borderColor = 'var(--color-error-text)';
        deleteBtn.addEventListener('click', () => {
            if (deleteRecord(record.id)) {
                renderRecordsList();
            }
        });

        actionsDiv.appendChild(detailBtn);
        actionsDiv.appendChild(deleteBtn);

        itemDiv.appendChild(headerDiv);
        itemDiv.appendChild(contentDiv);
        itemDiv.appendChild(actionsDiv);

        container.appendChild(itemDiv);
    });
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
        section.style.marginBottom = '1rem';

        const h3 = document.createElement('h3');
        h3.textContent = title;
        h3.style.fontSize = '1rem';
        h3.style.marginBottom = '0.25rem';
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
            const dom = createStrengthGroupedDOM(getRecordSelectedLabels(record, record.externalFactors));
            selectedContentWrapper.appendChild(dom);
        }
        if (category === 'mind' && record.mindNotifications.length > 0) {
            const h = document.createElement('h4');
            h.textContent = '【頭の中の通知】';
            h.style.marginTop = '0.5em';
            selectedContentWrapper.appendChild(h);
            const dom = createStrengthGroupedDOM(getRecordSelectedLabels(record, record.mindNotifications));
            selectedContentWrapper.appendChild(dom);
        }
        if (category === 'body' && record.body && record.body.entries && record.body.entries.length > 0) {
            const h = document.createElement('h4');
            h.textContent = '【身体感覚】';
            h.style.marginTop = '0.5em';
            selectedContentWrapper.appendChild(h);
            const dom = createStrengthGroupedDOM(getBodySensationsWithLabels(record));
            selectedContentWrapper.appendChild(dom);
        }
    });

    if (selectedContentWrapper.childNodes.length > 0) {
        container.appendChild(createSection('選択項目', selectedContentWrapper));
    }

    let nextActionsDOM = document.createElement('div');
    if (record.nextActions && record.nextActions.length > 0) {
        nextActionsDOM = createStrengthGroupedDOM(getRecordSelectedLabels(record, record.nextActions));
    } else {
        nextActionsDOM.textContent = '未選択';
    }
    container.appendChild(createSection('次の一手', nextActionsDOM));

    container.appendChild(createSection('共有文', record.shareText || 'なし'));
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
        itemDiv.style.border = '1px solid var(--color-border)';
        itemDiv.style.borderRadius = 'var(--radius-md)';
        itemDiv.style.padding = '1rem';
        itemDiv.style.marginBottom = '1rem';
        itemDiv.style.backgroundColor = 'var(--color-surface)';
        itemDiv.style.display = 'flex';
        itemDiv.style.flexDirection = 'column';
        itemDiv.style.gap = '0.75rem';

        // --- ヘッダー領域 ---
        const headerDiv = document.createElement('div');
        headerDiv.style.display = 'flex';
        headerDiv.style.justifyContent = 'space-between';
        headerDiv.style.alignItems = 'flex-start';
        headerDiv.style.flexWrap = 'wrap';
        headerDiv.style.gap = '0.5rem';

        const infoDiv = document.createElement('div');
        infoDiv.style.display = 'flex';
        infoDiv.style.flexDirection = 'column';
        infoDiv.style.gap = '0.25rem';

        const nameSpan = document.createElement('span');
        nameSpan.style.fontWeight = 'bold';
        nameSpan.style.fontSize = '1.1rem';
        nameSpan.textContent = item.label;
        if (item.isHidden) {
            nameSpan.style.textDecoration = 'line-through';
            nameSpan.style.color = 'var(--color-text-light)';
        }

        const badgesDiv = document.createElement('div');
        badgesDiv.style.display = 'flex';
        badgesDiv.style.gap = '0.5rem';
        badgesDiv.style.alignItems = 'center';
        badgesDiv.style.flexWrap = 'wrap';

        const groupSpan = document.createElement('span');
        groupSpan.style.fontSize = '0.8rem';
        groupSpan.style.color = 'var(--color-text-light)';
        groupSpan.style.backgroundColor = 'var(--color-bg)';
        groupSpan.style.padding = '0.2rem 0.5rem';
        groupSpan.style.borderRadius = 'var(--radius-sm)';
        groupSpan.textContent = item.group;

        const typeSpan = document.createElement('span');
        typeSpan.style.fontSize = '0.8rem';
        typeSpan.style.padding = '0.2rem 0.5rem';
        typeSpan.style.borderRadius = 'var(--radius-sm)';
        typeSpan.textContent = item.isDefault ? 'デフォルト' : '追加項目';
        typeSpan.style.backgroundColor = item.isDefault ? '#e0f7fa' : '#fff3e0';
        typeSpan.style.color = '#333';

        const statusSpan = document.createElement('span');
        statusSpan.style.fontSize = '0.8rem';
        statusSpan.style.padding = '0.2rem 0.5rem';
        statusSpan.style.borderRadius = 'var(--radius-sm)';
        statusSpan.textContent = item.isHidden ? '非表示' : '表示中';
        statusSpan.style.backgroundColor = item.isHidden ? 'var(--color-bg)' : '#e8f5e9';
        statusSpan.style.color = item.isHidden ? 'var(--color-error-text)' : '#2e7d32';

        badgesDiv.appendChild(groupSpan);
        badgesDiv.appendChild(typeSpan);
        badgesDiv.appendChild(statusSpan);

        infoDiv.appendChild(nameSpan);
        infoDiv.appendChild(badgesDiv);
        headerDiv.appendChild(infoDiv);

        // --- 操作ボタン領域 ---
        const actionsDiv = document.createElement('div');
        actionsDiv.style.display = 'flex';
        actionsDiv.style.gap = '0.5rem';
        actionsDiv.style.flexWrap = 'wrap';

        const renameBtn = document.createElement('button');
        renameBtn.textContent = '名前変更';
        renameBtn.style.padding = '0.4rem 0.8rem';
        renameBtn.style.fontSize = '0.9rem';
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
                saveState();
                renderEditItems();
            }
        });

        const toggleBtn = document.createElement('button');
        toggleBtn.textContent = item.isHidden ? '表示に戻す' : '非表示にする';
        toggleBtn.style.padding = '0.4rem 0.8rem';
        toggleBtn.style.fontSize = '0.9rem';
        toggleBtn.addEventListener('click', () => {
            item.isHidden = !item.isHidden;
            saveState();
            renderEditItems();
        });

        actionsDiv.appendChild(renameBtn);
        actionsDiv.appendChild(toggleBtn);

        if (!item.isDefault) {
            const deleteBtn = document.createElement('button');
            deleteBtn.textContent = '削除';
            deleteBtn.style.padding = '0.4rem 0.8rem';
            deleteBtn.style.fontSize = '0.9rem';
            deleteBtn.style.backgroundColor = 'var(--color-error-bg)';
            deleteBtn.style.color = 'var(--color-error-text)';
            deleteBtn.style.borderColor = 'var(--color-error-text)';
            deleteBtn.addEventListener('click', () => {
                if (isItemUsedInRecords(item.id)) {
                    if (confirm('この項目は過去の記録で使われています。記録の表示は保存時点の言葉で残りますが、今後の選択肢から外したいだけなら『非表示』がおすすめです。それでも削除しますか？')) {
                        appState.items = appState.items.filter(i => i.id !== item.id);
                        saveState();
                        renderEditItems();
                    }
                } else {
                    if (confirm('この項目を削除しますか？')) {
                        appState.items = appState.items.filter(i => i.id !== item.id);
                        saveState();
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
            // 既存のデフォルト項目は非表示状態を解除する（ラベルは維持）
            existingItem.isHidden = false;
        } else {
            // もし何らかの理由で削除されていたら再追加
            appState.items.push({
                ...defItem,
                createdAt: new Date().toISOString()
            });
        }
    });

    saveState();
    renderEditItems();
    showToast('初期項目を復元しました');
}

/* ========================================
   11. 初期化とイベントの接続
======================================== */
function initApp() {
    loadState();

    setupEventListeners();

    // 初回ガイドの表示判定
    if (!appState.hasSeenGuide) {
        switchView('view-guide');
    } else {
        switchView('view-home');
    }
}

function setupEventListeners() {
    // --- 初回ガイド ---
    document.getElementById('btn-guide-agree')?.addEventListener('click', () => {
        appState.hasSeenGuide = true;
        saveState();
        switchView('view-home');
    });

    // --- ホーム画面 ---
    document.getElementById('btn-home-start')?.addEventListener('click', () => {
        // 新しい記録の初期化
        currentRecord = JSON.parse(JSON.stringify(INITIAL_CURRENT_RECORD));
        currentBodyPartId = null; // リセット

        // スライダーの初期化
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

    // --- Step 6: 保存・共有 ---
    document.getElementById('btn-step6-back')?.addEventListener('click', () => {
        switchView('view-step5-action');
    });
    document.getElementById('btn-save-record')?.addEventListener('click', () => {
        saveCurrentRecord();
        showToast("記録を保存しました");
        switchView('view-home');
    });
    document.getElementById('btn-discard-record')?.addEventListener('click', () => {
        // 破棄時はnullではなく初期値のディープコピーに戻す
        currentRecord = JSON.parse(JSON.stringify(INITIAL_CURRENT_RECORD));
        currentBodyPartId = null;
        switchView('view-home');
    });

    // 共有文のコピー
    document.getElementById('btn-copy-share-text')?.addEventListener('click', () => {
        if (!currentRecord || !currentRecord.shareText) return;
        copyTextToClipboard(currentRecord.shareText);
    });

    // --- 記録一覧・詳細 ---
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
    document.getElementById('btn-detail-copy')?.addEventListener('click', () => {
        if (!currentDetailRecord || !currentDetailRecord.shareText) return;
        copyTextToClipboard(currentDetailRecord.shareText);
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

    // --- モーダルの操作 (第5段階: 項目追加) ---
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
        saveState();

        const callback = currentAddItemContext.afterAddCallback;
        closeAddItemModal(); // ここで currentAddItemContext = null になる

        if (callback) {
            callback(newItem.id);
        }
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
        }
    });
}

// DOMの読み込みが完了したらアプリを初期化
document.addEventListener('DOMContentLoaded', initApp);