// Saxophone Fingering Assistant - Full Range Version
// Использует полный диапазон C2 - F#6 из JSON файла

// Геометрия стана: те же числа, что в loadPositionsFromJSON и drawFullStaff
const STAFF_LINE_SPACING = 20;
// Верхняя линейка стана: при ней нота C4 попадает на первую добавочную снизу,
// A4 - во вторую полость, A5 - на первую добавочную сверху
const STAFF_MAIN_TOP = 90;
const STAFF_MAIN_BOTTOM = STAFF_MAIN_TOP + 4 * STAFF_LINE_SPACING; // 170
const STAFF_MIDDLE_LINE_Y = STAFF_MAIN_TOP + 2 * STAFF_LINE_SPACING; // 130
const STAFF_UPPER_LEDGER_COUNT = 4;
const STAFF_LOWER_LEDGER_COUNT = 4; // до C3: ниже приложение не работает
const STAFF_TOP_LEDGER = STAFF_MAIN_TOP - STAFF_UPPER_LEDGER_COUNT * STAFF_LINE_SPACING; // 10
const STAFF_BOTTOM_LEDGER = STAFF_MAIN_BOTTOM + STAFF_LOWER_LEDGER_COUNT * STAFF_LINE_SPACING; // 330
const STAFF_CLEF_WIDTH = 72; // место под скрипичный ключ и отступ до первой ноты
// Знак ноты рисуется в рамке 60px по центру ноты, то есть на 30px в каждую сторону
const GLYPH_HALF_WIDTH = 30;
// Высота ряда аппликатур при полном масштабе: карточка и панель вариантов
const FINGERING_ROW_HEIGHT = 230;
// Ниже этого предела строку не уменьшаем: аппликатуру уже не разобрать
const MIN_SYSTEM_SCALE = 0.6;
const HISTORY_LIMIT = 50;
// Длительности от самой длинной к самой короткой. По этой лесенке ходят
// Alt+вверх и Alt+вниз. Точки в неё не входят: их ставят отдельно, кнопками
// в окошке длительности
const DURATION_LADDER = [1, 2, 4, 8, 16];

// Отступ от верха области, когда показываем звучащую строку
const PLAYBACK_SCROLL_MARGIN = 8;
// Пауза между кругами при игре по кругу: за неё стан успевает подняться
// на первую строку, и видно первые аппликатуры
const LOOP_PAUSE_SECONDS = 2;
// Части адреса для связи, записанные задом наперёд и по отдельности.
// Готового адреса нет ни в разметке, ни здесь: он собирается только тогда,
// когда посетитель сам нажмёт «показать адрес». Это не защита, а помеха
// простым сборщикам адресов, которые читают исходный код страницы.
const CONTACT_PARTS = ['moc', 'liamg', 'idabis'];
const DEFAULT_TIME_SIGNATURE = '4/4';

// Короткий доступ к переводам: строки интерфейса живут в i18n.js
function t(key, params) {
    return I18n.t(key, params);
}

class FullRangeStaffManager {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        this.notes = [];
        this.selectedNoteId = null;
        // История для отката: снимки мелодии в том же виде, что и при сохранении
        this.history = [];
        this.redoHistory = [];
        this.restoring = false;
        this.selectedBarLineId = null;
        this.showNoteNames = true;
        this.showFingerings = true; // Показывать ряды аппликатур под станом
        this.imageSize = 80; // Ширина 80px, высота 200px
        this.displayMode = 'sharps'; // 'sharps' или 'flats'
        this.tempo = 80; // Темп воспроизведения, ударов в минуту
        this.loopPlayback = false;
        // Метроном и отсчёт перед началом
        // Сдвиг звука приложения: насколько звук отличается от нот на стане.
        // Ноль - нота звучит как записана, сдвиги идут уже от загруженного
        this.appSoundShift = 0;
        // Сдвиг звука инструмента: насколько саксофон звучит выше или ниже аппликатуры
        this.saxShift = 0;
        // Показывать звучащие ноты: включено - подписи звучащих нот,
        // выключено - написанные (истина тут у пианино)
        this.soundingNames = false;
        this.metronome = false;
        this.metronomeVolume = 0.6;
        this.countIn = false; // Играть по кругу
        this.timeSignature = DEFAULT_TIME_SIGNATURE; // Размер такта
        this.barLineMode = 'auto'; // 'auto' - черты по размеру, 'manual' - вручную
        this.notationMarks = []; // Элементы тактовых черт и знаков репризы
        this.measureCount = 0;
        this.staffContainers = []; // Станы по строкам
        this.fingeringContainers = []; // Ряды аппликатур по строкам
        this.resizeTimer = null;
        this.melodyPlayer = null;
        this.imageCache = null;
        this.autosaveTimer = null;
        this.loading = false;
        
        // Загружаем позиции из JSON (упрощенная версия)
        this.positions = this.loadPositionsFromJSON();
        
        this.init();
    }
    
    // Загрузка позиций из JSON (упрощенная версия)
    loadPositionsFromJSON() {
        // Создаем упрощенную версию данных на основе JSON
        // Всего 27 позиций от C2 до A5
        const positions = [];
        
        // Базовые координаты Y для нотного стана
        // 4 дополнительные линии снизу, 5 основных, 4 дополнительные сверху
        // В музыке: повышение идет снизу вверх, поэтому C2 (низ) должна быть внизу
        // Базовая высота фиксирована: положение нот на стане не должно зависеть
        // от того, сколько добавочных линеек нарисовано
        const baseY = 340;
        const lineSpacing = STAFF_LINE_SPACING;
        const verticalOffset = 0; // Сдвиг вверх убран: сверху нужно место под окошки длительности
        const noteOffset = lineSpacing; // Сдвиг нот ниже линеек на расстояние одного промежутка
        
        // Создаем позиции на основе данных из JSON
        // position_id от 1 до 27
        for (let i = 1; i <= 32; i++) {
            // Вычисляем Y координату на основе position_id
            // В JSON: y_half_steps от -1 до 25
            // C2 (position_id 1) должна быть внизу, A5 (position_id 27) вверху
            const yHalfSteps = i - 2; // position_id 1 -> y_half_steps -1
            const y = baseY - (yHalfSteps * (lineSpacing / 2)) - verticalOffset - noteOffset; // Обратный знак! и сдвиг вверх - сдвиг нот выше (в другую сторону)
        
            // Определяем имя ноты на основе position_id
            const noteInfo = this.getNoteInfoByPositionId(i);
            
            positions.push({
                id: i,
                name: noteInfo.name,
                displayName: noteInfo.displayName,
                y: y,
                description: noteInfo.description,
                fingering: noteInfo.fingering,
                hasFingering: noteInfo.hasFingering,
                variants: noteInfo.variants || 1
            });
        }
        
        return positions;
    }
    
    // Получение информации о ноте по position_id с учетом стратегии отображения
    getNoteInfoByPositionId(positionId) {
        // Базовое сопоставление position_id -> базовая нота и октава
        const baseNoteMap = {
            1: { baseNote: 'C', octave: 2 },
            2: { baseNote: 'D', octave: 2 },
            3: { baseNote: 'E', octave: 2 },
            4: { baseNote: 'F', octave: 2 },
            5: { baseNote: 'G', octave: 2 },
            6: { baseNote: 'A', octave: 2 },
            7: { baseNote: 'B', octave: 2 },
            8: { baseNote: 'C', octave: 3 },
            9: { baseNote: 'D', octave: 3 },
            10: { baseNote: 'E', octave: 3 },
            11: { baseNote: 'F', octave: 3 },
            12: { baseNote: 'G', octave: 3 },
            13: { baseNote: 'A', octave: 3 },
            14: { baseNote: 'B', octave: 3 },
            15: { baseNote: 'C', octave: 4 },
            16: { baseNote: 'D', octave: 4 },
            17: { baseNote: 'E', octave: 4 },
            18: { baseNote: 'F', octave: 4 },
            19: { baseNote: 'G', octave: 4 },
            20: { baseNote: 'A', octave: 4 },
            21: { baseNote: 'B', octave: 4 },
            22: { baseNote: 'C', octave: 5 },
            23: { baseNote: 'D', octave: 5 },
            24: { baseNote: 'E', octave: 5 },
            25: { baseNote: 'F', octave: 5 },
            26: { baseNote: 'G', octave: 5 },
            27: { baseNote: 'A', octave: 5 },
            28: { baseNote: 'B', octave: 5 },
            29: { baseNote: 'C', octave: 6 },
            30: { baseNote: 'D', octave: 6 },
            31: { baseNote: 'E', octave: 6 },
            32: { baseNote: 'F', octave: 6 }
        };
        
        const baseInfo = baseNoteMap[positionId] || { baseNote: '?', octave: 0 };
        
        // По умолчанию используем натуральную ноту
        const name = `${baseInfo.baseNote}${baseInfo.octave}`;
        const displayName = name;
        
        // Определяем аппликатуру на основе данных из JSON
        // Исправляем названия файлов согласно JSON
        const fingeringMap = {
            1: { fingering: null, hasFingering: false, variants: 1 },
            2: { fingering: null, hasFingering: false, variants: 1 },
            3: { fingering: null, hasFingering: false, variants: 1 },
            4: { fingering: null, hasFingering: false, variants: 1 },
            5: { fingering: null, hasFingering: false, variants: 1 },
            6: { fingering: null, hasFingering: false, variants: 1 },
            7: { fingering: null, hasFingering: false, variants: 1 },
            8: { fingering: null, hasFingering: false, variants: 1 },
            9: { fingering: null, hasFingering: false, variants: 1 },
            10: { fingering: null, hasFingering: false, variants: 1 },
            11: { fingering: null, hasFingering: false, variants: 1 },
            12: { fingering: null, hasFingering: false, variants: 1 },
            13: { fingering: '057_A3_v1.jpg', hasFingering: true, variants: 1 },
            14: { fingering: '059_B3_v1.jpg', hasFingering: true, variants: 1 },
            15: { fingering: '060_C4_v1.jpg', hasFingering: true, variants: 1 },
            16: { fingering: '062_D4_v1.jpg', hasFingering: true, variants: 1 },
            17: { fingering: '064_E4_v1.jpg', hasFingering: true, variants: 1 },
            18: { fingering: '065_F4_v1.jpg', hasFingering: true, variants: 1 },
            19: { fingering: '067_G4_v1.jpg', hasFingering: true, variants: 1 },
            20: { fingering: '069_A4_v1.jpg', hasFingering: true, variants: 1 },
            21: { fingering: '071_B4_v1.jpg', hasFingering: true, variants: 1 },
            22: { fingering: '072_C5_v1.jpg', hasFingering: true, variants: 2 },
            23: { fingering: '074_D5_v1.jpg', hasFingering: true, variants: 1 },
            24: { fingering: '076_E5_v1.jpg', hasFingering: true, variants: 1 },
            25: { fingering: '077_F5_v1.jpg', hasFingering: true, variants: 1 },
            26: { fingering: '079_G5_v1.jpg', hasFingering: true, variants: 1 },
            27: { fingering: '081_A5_v1.jpg', hasFingering: true, variants: 1 },
            28: { fingering: '083_B5_v1.jpg', hasFingering: true, variants: 1 },
            29: { fingering: '084_C6_v1.jpg', hasFingering: true, variants: 2 },
            30: { fingering: '086_D6_v1.jpg', hasFingering: true, variants: 1 },
            31: { fingering: '088_E6_v1.jpg', hasFingering: true, variants: 2 },
            32: { fingering: '089_F6_v1.jpg', hasFingering: true, variants: 2 }
        };
        
        const fingeringInfo = fingeringMap[positionId] || { fingering: null, hasFingering: false, variants: 1 };
        
        return {
            name: name,
            displayName: displayName,
            description: `${name} (позиция ${positionId})`,
            fingering: fingeringInfo.fingering,
            hasFingering: fingeringInfo.hasFingering,
            variants: fingeringInfo.variants,
            baseNote: baseInfo.baseNote,
            octave: baseInfo.octave
        };
    }
    
    init() {
        // Язык ставим до первой отрисовки, чтобы все подписи были на нём
        I18n.setLang(I18n.detectLang(), false);

        this.syncSystems(1);
        this.updateNoteCount();
        this.updateAllFingerings();
        this.setFingeringsVisible(this.showFingerings, true);
        this.initImageCache();
        this.melodyPlayer = Playback.createPlayer();
        document.addEventListener('click', () => this.closeDurationMenus());
        
        // При изменении ширины окна строки пересобираются
        window.addEventListener('resize', () => {
            clearTimeout(this.resizeTimer);
            this.resizeTimer = setTimeout(() => this.relayout(), 150);
        });
        
        const signatureSelect = document.getElementById('time-signature');
        if (signatureSelect) signatureSelect.value = this.timeSignature;
        
        const fingeringsCheckbox = document.getElementById('show-fingerings');
        if (fingeringsCheckbox) {
            fingeringsCheckbox.checked = this.showFingerings;
            fingeringsCheckbox.addEventListener('change', (e) => {
                this.setFingeringsVisible(e.target.checked);
            });
        }
        
        const loopCheckbox = document.getElementById('loop-playback');
        if (loopCheckbox) {
            loopCheckbox.checked = this.loopPlayback;
            loopCheckbox.addEventListener('change', (e) => {
                this.setLoopPlayback(e.target.checked);
            });

        
document.getElementById('metronome-on').addEventListener('change', (e) => {
        
    staffManager.metronome = e.target.checked;
        
    staffManager.metronomeVolume = parseInt(document.getElementById('metronome-volume').value, 10) / 100;
        
    staffManager.melodyPlayer.setMetronomeVolume(staffManager.metronomeVolume);
        
    staffManager.scheduleAutosave();
        
});

        
document.getElementById('metronome-volume').addEventListener('input', (e) => {
        
    staffManager.metronomeVolume = parseInt(e.target.value, 10) / 100;
        
    staffManager.melodyPlayer.setMetronomeVolume(staffManager.metronomeVolume);
        
});

        
document.getElementById('count-in-on').addEventListener('change', (e) => {
        
    staffManager.countIn = e.target.checked;
        
    staffManager.scheduleAutosave();
        
});

        }
        
        this.bindLanguageSwitch();
        this.bindModal('about-modal', 'btn-about');
        this.bindModal('help-modal', 'btn-help');
        this.initConsent();
        this.updateLanguageButtons();
        this.updateBarLineButtons();
        this.updateMeasureInfo();
        this.updateStatus(t('status.ready'));
    }
    
    // === Язык, окно «О проекте», предупреждение о настройках ===
    
    bindLanguageSwitch() {
        document.querySelectorAll('.lang-btn').forEach(button => {
            button.addEventListener('click', () => this.applyLanguage(button.dataset.lang));
        });
    }
    
    updateLanguageButtons() {
        const current = I18n.getLang();
        document.querySelectorAll('.lang-btn').forEach(button => {
            button.classList.toggle('active', button.dataset.lang === current);
        });
    }
    
    applyLanguage(lang, persist = true) {
        I18n.setLang(lang, persist);
        this.refreshTexts();
        this.updateLanguageButtons();
    }
    
    // Перевыводит всё, что формируется кодом: подписи знаков, окошки, строки
    refreshTexts() {
        this.closeDurationMenus();
        
        this.staffContainers.forEach(staff => {
            staff.title = t('staff.staffTitle');
            const clef = staff.querySelector('.staff-clef');
            if (clef) clef.title = t('staff.clef');
        });
        
        this.notes.forEach(element => {
            const label = element.element ? element.element.querySelector('.note-label') : null;
            if (label) label.textContent = this.displayNoteName(element.noteName);
            this.refreshElement(element);
        });
        
        const selected = this.notes.find(n => n.id === this.selectedNoteId);
        if (selected) this.updateSelectionInfo(selected);
        else document.getElementById('selected-note').textContent = t('app.none');
        
        this.relayout();
        this.updateBarLineButtons();
        this.updateCacheStatus();
    }
    
    // Обновляет подписи о выделенном элементе в шапке
    updateSelectionInfo(element) {
        document.getElementById('selected-note').textContent = element.isRest ? t('rest.word') : element.displayName;
        document.getElementById('selected-note-info').textContent = element.isRest
            ? t(element.dotted ? 'rest.infoDotted' : 'rest.info', { name: this.durationLabel(element.duration) })
            : t('note.info', { name: element.displayName, position: element.positionId });
    }
    
    bindModal(modalId, buttonId) {
        const modal = document.getElementById(modalId);
        const openButton = document.getElementById(buttonId);
        if (!modal || !openButton) return;
        
        const close = () => { modal.hidden = true; };
        
        openButton.addEventListener('click', () => { modal.hidden = false; });
        modal.querySelectorAll('[data-close-modal]').forEach(node => {
            node.addEventListener('click', close);
        });
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && !modal.hidden) close();
        });
        
        this.bindContactReveal();
    }
    
    // Адрес для связи собирается из частей в обратном порядке:
    // имя и почтовый сервис соединяются собачкой, домен - точкой
    contactAddress() {
        const parts = CONTACT_PARTS
            .map(part => part.split('').reverse().join(''))
            .reverse();
        
        return parts[0] + '@' + parts.slice(1).join('.');
    }
    
    // Пока адрес не попросили, в разметке нет ни его, ни ссылки mailto
    bindContactReveal() {
        const button = document.getElementById('about-contact-show');
        if (!button || button.dataset.ready === '1') return;
        
        button.dataset.ready = '1';
        button.addEventListener('click', () => {
            const address = this.contactAddress();
            
            const link = document.createElement('a');
            link.className = 'about-contact-link';
            link.href = 'mailto:' + address;
            link.textContent = address;
            
            button.replaceWith(link);
        });
    }
    
    initConsent() {
        const banner = document.getElementById('consent');
        const okButton = document.getElementById('consent-ok');
        if (!banner || !okButton) return;
        
        if (!I18n.consentGiven()) banner.hidden = false;
        
        okButton.addEventListener('click', () => {
            I18n.giveConsent();
            banner.hidden = true;
        });
    }
    
    // Показ рядов аппликатур под станом
    setFingeringsVisible(show, silent = false) {        this.showFingerings = show !== false;
        
        if (this.container) {
            this.container.classList.toggle('hide-fingerings', !this.showFingerings);
        }
        
        const checkbox = document.getElementById('show-fingerings');
        if (checkbox && checkbox.checked !== this.showFingerings) {
            checkbox.checked = this.showFingerings;
        }
        
        if (!silent) this.scheduleAutosave();
    }
    
    // Зацикливание воспроизведения
    setLoopPlayback(loop, silent = false) {
        this.loopPlayback = !!loop;
        
        const checkbox = document.getElementById('loop-playback');
        if (checkbox && checkbox.checked !== this.loopPlayback) {
            checkbox.checked = this.loopPlayback;
        }
        
        if (!silent) this.scheduleAutosave();
    }
    
    // === Строки стана ===
    
    // Строит одну строку: стан с линейками и маркерами плюс ряд аппликатур под ним
    buildSystem(index) {
        const system = document.createElement('div');
        system.className = 'system';
        
        const wrapper = document.createElement('div');
        wrapper.className = 'staff-wrapper';
        
        const staff = document.createElement('div');
        staff.className = 'staff';
        staff.title = t('staff.staffTitle');
        
        this.drawStaffLines(staff);
        this.drawClef(staff);
        this.drawPositionMarkers(staff);
        
        staff.addEventListener('click', (e) => {
            if (e.target === staff) {
                this.deselectNote();
            }
        });
        
        wrapper.appendChild(staff);
        system.appendChild(wrapper);
        
        const row = document.createElement('div');
        row.className = 'fingerings-row';
        row.style.paddingLeft = STAFF_CLEF_WIDTH + 'px'; // карточки выравниваются с нотами
        row.style.gap = '0px'; // между карточками не должно быть промежутков
        row.style.columnGap = '0px';
        system.appendChild(row);
        
        this.container.appendChild(system);
        this.staffContainers.push(staff);
        this.fingeringContainers.push(row);
    }
    
    // Приводит число строк к нужному. Пересобирает их только при изменении количества,
    // ноты при этом переносятся заново в раскладке.
    syncSystems(count) {
        if (this.staffContainers.length === count) return;
        
        this.container.innerHTML = '';
        this.staffContainers = [];
        this.fingeringContainers = [];
        
        for (let index = 0; index < count; index++) {
            this.buildSystem(index);
        }
        
        // Запас под последней строкой, высоту задаёт updateStaffTail
        this.staffTail = document.createElement('div');
        this.staffTail.className = 'staff-tail';
        this.container.appendChild(this.staffTail);
    }
    
    // Ширина, доступная под одну строку
    staffWidth() {
        const width = this.container ? this.container.clientWidth : 0;
        // Контейнер не масштабируется, а строка внутри него - да: при zoom
        // собственные пиксели строки крупнее экранных во столько же раз.
        // Раскладке нужна именно ширина строки в её пикселях, иначе ноты
        // займут лишь часть стана и справа останутся пустые линейки.
        const usable = width / (this.systemScaleValue || 1);
        return usable > 120 ? usable : 900;
    }
    
    // Сколько высоты остаётся под строку: окно минус шапка, панель и подвал
    viewportFreeHeight() {
        let chrome = 0;
        ['.app-header', '.staff-header', '.app-footer'].forEach(selector => {
            const node = document.querySelector(selector);
            if (node && !node.hidden) chrome += node.getBoundingClientRect().height;
        });
        return window.innerHeight - chrome - 24;
    }
    
    // Масштаб строки. На низком экране строка со станом и аппликатурами
    // не помещается целиком, а учиться по обрезанной картинке нельзя.
    // Уменьшаем строку целиком: zoom, в отличие от transform, меняет и
    // раскладку, поэтому ширина задаётся обратной долей - и строка
    // по-прежнему занимает всю ширину экрана, просто мельче.
    systemScale() {
        const metrics = this.systemMetrics();
        const required = metrics.height + FINGERING_ROW_HEIGHT + 34;
        const available = this.viewportFreeHeight();
        
        if (available <= 0 || required <= available) return 1;
        
        const scale = available / required;
        return Math.max(MIN_SYSTEM_SCALE, Math.round(scale * 100) / 100);
    }
    
    // Применяем масштаб к строкам. Ширину не трогаем: zoom сам меняет систему
    // координат строки, поэтому width: 100% даёт ровно ширину экрана, а
    // собственные пиксели строки становятся крупнее - в них влезает больше нот.
    // Если задать ширину обратной долей, строка вылезет за экран вправо.
    applySystemScale() {
        const scale = this.systemScaleValue || 1;
        
        this.staffContainers.forEach(staff => {
            const system = staff.closest('.system');
            if (!system) return;
            
            system.style.zoom = scale === 1 ? '' : String(scale);
        });
    }
    
    // Сколько элементов влезает в одну строку (минус место под ключ)
    elementsPerSystem() {
        const slot = this.imageSize + 2;
        
        // Знак ноты шире половины шага при узких картинках: он по центру ноты
        // и выступает на 30px вправо. Плюс 2px запаса на разделитель такта.
        // Без этого запаса внизу поля появляется горизонтальная прокрутка.
        const overhang = Math.max(0, GLYPH_HALF_WIDTH - slot / 2) + 2;
        const usable = this.staffWidth() - STAFF_CLEF_WIDTH - overhang;
        
        return Math.max(1, Math.floor(usable / slot));
    }
    
    // Элементы, сгруппированные по тактам
    measureGroups() {
        const marks = this.computeBarLines();
        const groups = [];
        let current = [];
        
        this.notes.forEach(element => {
            current.push(element);
            if (marks.has(element.id)) {
                groups.push(current);
                current = [];
            }
        });
        
        if (current.length) groups.push(current);
        return groups;
    }
    
    // Разбивка мелодии на строки. Граница строки - граница такта.
    // Такт, который не влезает в строку целиком, режется принудительно.
    computeSystems() {
        if (!this.notes.length) return [[]];
        
        const perSystem = this.elementsPerSystem();
        const systems = [];
        let current = [];
        
        const flush = () => {
            if (current.length) {
                systems.push(current);
                current = [];
            }
        };
        
        this.measureGroups().forEach(group => {
            let rest = group;
            
            while (rest.length > perSystem) {
                flush();
                systems.push(rest.slice(0, perSystem));
                rest = rest.slice(perSystem);
            }
            
            if (current.length && current.length + rest.length > perSystem) flush();
            current = current.concat(rest);
        });
        
        flush();
        return systems.length ? systems : [[]];
    }
    
    // Кэш картинок аппликатур. Под file:// браузер обычно запрещает странице
    // читать соседние файлы, поэтому кэш включается только там, где чтение разрешено.
    initImageCache() {
        if (typeof FingeringImageCache !== 'function') return;
        
        this.imageCache = new FingeringImageCache('fingerings_images/');
        
        // Готовность кэша держим в поле: по ней удобно дождаться наполнения
        this.cacheReady = this.imageCache.init()
            .then(() => this.imageCache.sync(this.collectFingeringFiles(), (done, total) => {
                this.updateCacheStatus(t('status.caching', { done: done, total: total }));
            }))
            .then(status => {
                this.updateCacheStatus();
                if (status && status.readable && status.stored > 0) {
                    this.updateAllFingerings();
                }
            })
            .catch(() => this.updateCacheStatus());
    }
    
    // Список всех файлов аппликатур, которые могут понадобиться
    collectFingeringFiles() {
        this.getNoteInfoByName('C4'); // Гарантируем построение карты нот
        const files = new Set();
        
        Object.keys(this._noteMap || {}).forEach(key => {
            const info = this._noteMap[key];
            if (!info.hasFingering || !info.fingering) return;
            const base = info.fingering.replace(/_v\d+\.jpg$/, '');
            const count = info.variants || 1;
            for (let variant = 1; variant <= count; variant++) {
                files.add(`${base}_v${variant}.jpg`);
            }
        });
        
        return Array.from(files);
    }
    
    updateCacheStatus(message) {
        const node = document.getElementById('cache-status');
        if (!node) return;
        
        if (message) {
            node.textContent = message;
            return;
        }
        
        const status = this.imageCache ? this.imageCache.status() : null;
        if (!status) {
            node.textContent = '';
            return;
        }
        
        if (status.readable && status.stored > 0) {
            node.textContent = t('status.cacheReady', { n: status.stored });
        } else {
            node.textContent = t('status.cacheFallback');
        }
    }
    
    // Путь к картинке: из кэша, если он доступен, иначе напрямую из папки
    imageUrl(fileName) {
        if (this.imageCache && this.imageCache.has(fileName)) {
            return this.imageCache.url(fileName);
        }
        return 'fingerings_images/' + encodeURIComponent(fileName);
    }
    
    accidentalOf(noteName) {
        if (!noteName) return '';
        if (noteName.indexOf('#') !== -1) return '#';
        if (noteName.indexOf('b') !== -1) return 'b';
        return '';
    }
    
    // Линейки стана: 4 дополнительные сверху, 5 основных, 4 дополнительные снизу
    drawStaffLines(staff) {
        const verticalOffset = 0; // Стан не сдвигаем: сверху место под окошки длительности
        
        // Дополнительные линии сверху (A5 и выше)
        for (let i = 0; i < STAFF_UPPER_LEDGER_COUNT; i++) {
            const y = STAFF_MAIN_TOP - (i + 1) * STAFF_LINE_SPACING - verticalOffset;
            const line = document.createElement('div');
            line.className = 'staff-line';
            line.style.top = y + 'px';
            line.style.opacity = '0.5';
            staff.appendChild(line);
        }
        
        // Пять основных линий
        for (let i = 0; i < 5; i++) {
            const y = STAFF_MAIN_TOP + i * STAFF_LINE_SPACING - verticalOffset;
            const line = document.createElement('div');
            line.className = 'staff-line';
            line.style.top = y + 'px';
            staff.appendChild(line);
        }
        
        // Дополнительные линии снизу
        for (let i = 0; i < STAFF_LOWER_LEDGER_COUNT; i++) {
            const y = STAFF_MAIN_BOTTOM + (i + 1) * STAFF_LINE_SPACING - verticalOffset;
            const line = document.createElement('div');
            line.className = 'staff-line';
            line.style.top = y + 'px';
            line.style.opacity = '0.5';
            staff.appendChild(line);
        }
    }
    
    // Скрипичный ключ в начале строки
    drawClef(staff) {
        const clef = document.createElement('div');
        clef.className = 'staff-clef';
        clef.textContent = '\uD834\uDD1E'; // U+1D11E, скрипичный ключ
        clef.title = t('staff.clef');
        staff.appendChild(clef);
    }
    
    // Левый край последнего такта в координатах стана
    lastMeasureLeft() {
        if (!this.notes.length) return null;

        const measure = this.measureBeats();
        const slot = this.imageSize + 2;
        let total = 0;
        this.notes.forEach(element => { total += this.elementBeats(element); });

        const lastStart = Math.max(0, Math.floor((total - 1e-6) / measure) * measure);
        let beat = 0;

        for (let i = 0; i < this.notes.length; i++) {
            const element = this.notes[i];
            const beats = this.elementBeats(element);

            if (beat + beats > lastStart + 1e-6) {
                const share = beats > 0 ? Math.max(0, (lastStart - beat) / beats) : 0;
                return element.x - slot / 2 + slot * share;
            }

            beat += beats;
        }

        return null;
    }

    // Новую ноту ставим только в последнем такте последней строки: промах по
    // стану при правке иначе добавлял в конец мелодии лишнюю ноту
    canAddNoteAt(event) {
        if (!this.notes.length) return true;

        const marker = event.currentTarget;
        const index = this.staffContainers.findIndex(node => node.contains(marker));
        if (index === -1) return true;

        const lastSystem = this.notes[this.notes.length - 1].system;
        if (index !== lastSystem) return false;

        const from = this.lastMeasureLeft();
        if (from === null) return true;

        const box = this.staffContainers[index].getBoundingClientRect();
        const zoom = this.systemScaleValue || 1;
        const x = (event.clientX - box.left) / zoom;

        return x >= from - 1;
    }
    drawPositionMarkers(staff) {
        this.positions.forEach(position => {
            const marker = document.createElement('div');
            marker.className = 'position-marker';
            marker.style.top = (position.y - 25) + 'px';
            marker.style.left = '0'; // Начинаем от левого края
            marker.style.width = '100%'; // Занимаем всю ширину
            // Ниже C3 приложение не работает, маркеры этих позиций не показываем
            if (position.id < 8) { marker.style.display = 'none'; }
            marker.setAttribute('data-position-id', position.id);
            marker.setAttribute('title', t('marker.title', { name: position.displayName, position: position.id }));
            
            marker.addEventListener('click', (e) => {
                e.stopPropagation();
                // Только последний такт: промах по стану не должен добавлять ноту
                if (!this.canAddNoteAt(e)) {
                this.updateStatus(t('status.addOnlyInLastBar'));
                return;
            }

                this.addNote(position.id);
            });
            
            staff.appendChild(marker);
        });
    }
    
    // Добавление ноты. insertIndex не задан - нота встаёт в конец мелодии.
    addNote(positionId, noteName = null, insertIndex = null, options = {}) {
        // Откат запоминаем до изменения, и только для ручных действий:
        // при загрузке мелодии ноты добавляются пачкой и история не нужна
        if (!options.silent) this.pushHistory();
        // Если передан noteName, используем его для получения правильной информации о ноте
        let noteInfo;
        let position;
        
        if (noteName) {
            // Получаем информацию о ноте по имени (учитывает диезы/бемоли)
            noteInfo = this.getNoteInfoByName(noteName);
            // Находим позицию для этой ноты
            position = this.positions.find(p => p.id === noteInfo.positionId);
        } else {
            // Используем positionId для получения базовой информации
            position = this.positions.find(p => p.id === positionId);
            if (position) {
                // Получаем информацию о ноте по имени из позиции
                noteInfo = this.getNoteInfoByName(position.name);
            }
        }
        
        if (!position || !noteInfo) return null;
        
        const noteId = 'note_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);

    // Длительность берём у последнего элемента мелодии: четвертная остаётся
    // только для первой ноты. При вставке в середину длительность задаёт
    // вызывающий, поэтому там наследование не мешает
    const previous = this.notes.length ? this.notes[this.notes.length - 1] : null;
    const inherit = previous && insertIndex === null ? previous : null;
        
        const note = {
            id: noteId,
            element: null,
            isRest: false,
            positionId: noteInfo.positionId,
            noteName: noteInfo.displayName,
            displayName: noteInfo.displayName,
            accidental: this.accidentalOf(noteInfo.displayName),
            fingering: this.fingeringFor(noteInfo.displayName).fingering,
            fingeringBase: this.fingeringFor(noteInfo.displayName).fingering ? this.fingeringFor(noteInfo.displayName).fingering.replace(/_v\d+\.jpg$/, '') : null,
            hasFingering: this.fingeringFor(noteInfo.displayName).hasFingering,
            variants: this.fingeringFor(noteInfo.displayName).variants || 1,
            currentVariant: 1,
            duration: inherit ? (inherit.duration || 4) : 4,
            dotted: inherit ? Playback.dotCount(inherit.dotted) : 0,
            stemUp: position.y > STAFF_MIDDLE_LINE_Y,
            x: 0,
            y: position.y,
            hasBarLine: false, // Тактовая черта после ноты (ручной режим)
            repeatStart: false, // Начало репризы перед нотой
            repeatEnd: false, // Конец репризы после ноты
            crossesBoundary: false // Нота переходит через границу такта
        };
        
        this.buildElementDom(note);
        this.insertElement(note, insertIndex, !!options.silent);
        
        if (!options.silent) {
            this.selectNote(noteId);
            this.updateStatus(t('status.addedNote', { name: noteInfo.displayName, position: noteInfo.positionId }));
            this.scheduleAutosave();
            this.scrollToRight();
            this.playNotePreview(note);
        }
        
        return noteId;
    }
    
    // Добавление паузы. insertIndex не задан - пауза встаёт в конец мелодии.
    addRest(insertIndex = null, options = {}) {
        // Как и у ноты: история только для ручной вставки паузы
        if (!options.silent) this.pushHistory();
        const restId = 'rest_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);

        // Пауза берёт длительность у последнего элемента - так же, как нота
        const previousRest = this.notes.length ? this.notes[this.notes.length - 1] : null;
        const inheritRest = previousRest && insertIndex === null ? previousRest : null;
        
        const rest = {
            id: restId,
            element: null,
            isRest: true,
            positionId: null,
            noteName: null,
            displayName: t('rest.word'),
            accidental: '',
            fingering: null,
            fingeringBase: null,
            hasFingering: false,
            variants: 1,
            currentVariant: 1,
            duration: inheritRest ? (inheritRest.duration || 4) : 4,
            dotted: inheritRest ? Playback.dotCount(inheritRest.dotted) : 0,
            stemUp: false,
            x: 0,
            y: STAFF_MIDDLE_LINE_Y, // пауза стоит у средней линии
            hasBarLine: false,
            repeatStart: false,
            repeatEnd: false,
            crossesBoundary: false
        };
        
        this.buildElementDom(rest);
        this.insertElement(rest, insertIndex, !!options.silent);
        
        if (!options.silent) {
            this.selectNote(restId);
            this.updateStatus(t('status.addedRest'));
            this.scheduleAutosave();
            this.scrollToRight();
        }
        
        return restId;
    }
    
    // Создаёт DOM элемента: знак ноты или паузы, окошко длительности и подпись названия
    buildElementDom(element) {
        const anchor = document.createElement('div');
        anchor.className = 'note-anchor fade-in';
        anchor.id = element.id;
        anchor.setAttribute('data-type', element.isRest ? 'rest' : 'note');
            // Высокие ноты: окошко длительности показываем ниже ноты,
            // сверху ему не хватает места и его закрывает шапка строки
            if (!element.isRest && element.y < 50) anchor.setAttribute('data-high', '1');
        anchor.setAttribute('data-stem', element.stemUp ? 'up' : 'down');
        anchor.setAttribute('data-element-id', element.id);
        
        anchor.innerHTML = this.glyphMarkup(element) +
            this.durationPanelMarkup(element) +
            (this.showNoteNames && !element.isRest ? `<div class="note-label">${this.displayNoteName(element.noteName)}</div>` : '');
        
        anchor.addEventListener('click', (e) => {
            e.stopPropagation();
            this.selectNote(element.id);
            // По клику слышно высоту ноты. Именно по клику, а не при выделении:
            // выделение ставится и программно - при загрузке мелодии, удалении,
            // перестановке, - и звук там был бы лишним.
            this.playNotePreview(element);
        });
        
        this.bindDurationPanel(anchor, element);
        
        element.element = anchor;
        // Предварительно в первую строку: раскладка перенесёт элемент куда надо
        (this.staffContainers[0] || this.container).appendChild(anchor);
        return anchor;
    }
    
    glyphMarkup(element) {
        if (element.isRest) {
            return NoteSymbols.restSvg({ duration: element.duration, dotted: element.dotted });
        }
        return NoteSymbols.noteSvg({
            duration: element.duration,
            dotted: element.dotted,
            stemUp: element.stemUp,
            accidental: element.accidental
        });
    }
    
    // Название длительности на текущем языке
    durationLabel(value) {
        const key = 'duration.' + value;
        const translated = t(key);
        return translated === key ? NoteSymbols.durationInfo(value).label : translated;
    }
    
    // Подпись кнопки точек: сколько точек стоит у ноты
    // Три отдельные кнопки: одна, две и три точки. Окошко показывается
    // только у выделенной ноты, поэтому место есть
    dotsChoiceMarkup(element) {
        const current = Playback.dotCount(element.dotted);
        let markup = '<span class="dot-choices">';
    
        for (let count = 1; count <= 3; count++) {
            const dots = '•'.repeat(count);
            const active = current === count ? ' active' : '';
            markup += `<button type="button" class="dot-choice${active}" data-dots="${count}" ` +
                `title="${t('duration.dot' + count)}">${dots}</button>`;
        }
    
        return markup + '</span>';
    }
    durationPanelMarkup(element) {
        const options = NoteSymbols.DURATIONS.map(item =>
            `<button type="button" class="duration-option${item.value === element.duration ? ' active' : ''}" ` +
            `data-duration="${item.value}">${this.durationLabel(item.value)}</button>`
        ).join('');
        
        return '<div class="duration-panel">' +
            `<button type="button" class="duration-btn" title="${t('duration.buttonTitle')}">` +
            NoteSymbols.durationInfo(element.duration).short + '</button>' +
            this.dotsChoiceMarkup(element) +
            `<div class="duration-menu">${options}</div>` +
            '</div>';
    }
    
    bindDurationPanel(anchor, element) {
        const button = anchor.querySelector('.duration-btn');
        const menu = anchor.querySelector('.duration-menu');
        const dotChoices = anchor.querySelectorAll('.dot-choice');
        
        button.addEventListener('click', (e) => {
            e.stopPropagation();
            this.toggleDurationMenu(menu, anchor);
        });
        
        menu.querySelectorAll('.duration-option').forEach(option => {
            option.addEventListener('click', (e) => {
                e.stopPropagation();
                this.closeDurationMenus();
                this.setElementDuration(element, parseInt(option.dataset.duration, 10));
            });
        });
        
        anchor.querySelectorAll('.dot-choice').forEach(choice => {             choice.addEventListener('click', (e) => {                 e.stopPropagation();                 const count = Number(choice.dataset.dots);                 const current = Playback.dotCount(element.dotted);                 this.setElementDotted(element, current === count ? 0 : count);             });         });
    }
    
    toggleDurationMenu(menu, anchor) {
        const wasOpen = menu.classList.contains('open');
        this.closeDurationMenus();
        if (!wasOpen) this.openDurationMenu(menu, anchor);
    }
    
    // Меню показывается поверх всего: переносим его в body и ставим по координатам
    // кнопки, иначе его обрезают контейнеры стана, а соседние ноты перекрывают.
    openDurationMenu(menu, anchor) {
        const button = anchor.querySelector('.duration-btn');
        if (!button) return;
        
        if (!menu.__origin) menu.__origin = menu.parentElement;
        
        document.body.appendChild(menu);
        menu.classList.add('open');
        anchor.classList.add('menu-open');
        
        const buttonRect = button.getBoundingClientRect();
        const menuRect = menu.getBoundingClientRect();
        
        // Над кнопкой, а если не влезает - под ней
        let top = buttonRect.top - menuRect.height - 4;
        if (top < 4) top = buttonRect.bottom + 4;
        
        let left = buttonRect.left + buttonRect.width / 2 - menuRect.width / 2;
        left = Math.max(4, Math.min(left, window.innerWidth - menuRect.width - 4));
        
        menu.style.left = Math.round(left) + 'px';
        menu.style.top = Math.round(top) + 'px';
    }
    
    closeDurationMenus() {
        document.querySelectorAll('.duration-menu.open').forEach(menu => {
            menu.classList.remove('open');
            menu.style.left = '';
            menu.style.top = '';
            if (menu.__origin && menu.parentElement !== menu.__origin) {
                menu.__origin.appendChild(menu);
            }
        });
        document.querySelectorAll('.note-anchor.menu-open').forEach(anchor => anchor.classList.remove('menu-open'));
    }
    
    setElementDuration(element, duration, options = {}) {
        if (!duration || element.duration === duration) return;
        
        if (options.history !== false) this.pushHistory();
        
        element.duration = duration;
        this.refreshElement(element);
        // Длительность влияет на границы тактов, поэтому черты пересчитываем
        this.relayout();
        this.updateStatus(t(element.dotted ? 'status.durationSetDotted' : 'status.durationSet',
            { name: this.durationLabel(duration) }));
        this.scheduleAutosave();
    }
    
    setElementDotted(element, dotted, options = {}) {
        const count = Playback.dotCount(dotted);
        if (Playback.dotCount(element.dotted) === count) return;
        
        if (options.history !== false) this.pushHistory();
        element.dotted = count;
        this.refreshElement(element);
        // Точка меняет длительность, а значит и границы тактов
        this.relayout();
        this.updateStatus(t('status.dotsSet', { count: count }));
        this.scheduleAutosave();
    }
    
    // Перерисовка знака и окошка длительности без изменения положения элемента
    refreshElement(element) {
        const anchor = element.element;
        if (!anchor) return;
        
        const svg = anchor.querySelector('.glyph-svg');
        if (svg) {
            const holder = document.createElement('div');
            holder.innerHTML = this.glyphMarkup(element);
            svg.replaceWith(holder.firstElementChild);
        }
        
        const button = anchor.querySelector('.duration-btn');
        if (button) {
            button.textContent = NoteSymbols.durationInfo(element.duration).short;
            button.title = t('duration.buttonTitle');
        }
        
        const dotLabel = anchor.querySelector('.dot-toggle');
        if (dotLabel) dotLabel.title = t('duration.dotTitle');
        
        anchor.querySelectorAll('.duration-option').forEach(option => {
            const value = parseInt(option.dataset.duration, 10);
            option.textContent = this.durationLabel(value);
            option.classList.toggle('active', value === element.duration);
        });
        
        const dotChoices = anchor.querySelectorAll('.dot-choice');         const currentDots = Playback.dotCount(element.dotted);         dotChoices.forEach(node => {             node.classList.toggle('active', Number(node.dataset.dots) === currentDots);         });
    }
    
    // Вставка элемента в мелодию и полный пересчёт раскладки
    // skipRelayout - для массовой загрузки: перерисовывать после каждого
    // элемента нельзя, иначе получается квадрат по времени и большие мелодии
    // встают намертво. Вызывающий обязан перерисовать всё один раз в конце.
    insertElement(element, insertIndex, skipRelayout) {
        const index = (insertIndex === null || insertIndex === undefined ||
            insertIndex < 0 || insertIndex > this.notes.length)
            ? this.notes.length
            : insertIndex;
        
        this.notes.splice(index, 0, element);
        
        if (!skipRelayout) this.relayout();
    }
    
    relayout() {
        this.closeDurationMenus();
        this.updateNotePositions();
        this.updateNoteCount();
        this.updateAllFingerings();
        this.updateFileButtons();
    }
    
    // На пустом стане сохранять нечего, поэтому кнопки сохранения гаснут
    updateFileButtons() {
        const hasNotes = this.notes.length > 0;
        
        ['btn-save', 'btn-midi-save'].forEach(id => {
            const button = document.getElementById(id);
            if (button) button.disabled = !hasNotes;
        });
    }
    
    selectedIndex() {
        return this.notes.findIndex(n => n.id === this.selectedNoteId);
    }
    
    scrollToRight() {
        // Прокручиваем scrollable-area вправо, чтобы новый элемент был виден
        setTimeout(() => {
            const scrollableArea = document.querySelector('.scrollable-area');
            if (scrollableArea) {
                scrollableArea.scrollLeft = scrollableArea.scrollWidth - scrollableArea.clientWidth;
            }
        }, 50);
    }
    
    selectNote(noteId) {
        if (this.selectedNoteId === noteId) {
            this.deselectNote();
            return;
        }
        
        this.deselectNote();
        
        const note = this.notes.find(n => n.id === noteId);
        if (!note) return;
        
        note.element.classList.add('selected');
        this.selectedNoteId = noteId;
        
        document.getElementById('selected-note').textContent = note.isRest ? t('rest.word') : note.displayName;
        document.getElementById('selected-note-info').textContent = note.isRest
            ? t(note.dotted ? 'rest.infoDotted' : 'rest.info', { name: this.durationLabel(note.duration) })
            : `${note.displayName} (позиция ${note.positionId})`;
        
        // Включаем кнопки управления нотой; у паузы высоты нет
        document.getElementById('btn-note-up').disabled = note.isRest;
        document.getElementById('btn-note-down').disabled = note.isRest;
        document.getElementById('btn-delete-note').disabled = false;
        // Вставить можно перед выделенным, поэтому кнопка живёт вместе с удалением
        document.getElementById('btn-insert-note').disabled = false;
        
        // Кнопки тактовых черт и репризы зависят от выделения
        this.updateBarLineButtons();
        
        // Обновляем аппликатуры
        this.updateFingering(note);
        
        this.updateStatus(note.isRest ? t('status.selectedRest') : t('status.selectedNote', { name: note.displayName }));
    }
    
    deselectNote() {
        // Снимаем выделение - убираем и окошко длительности: на планшете
        // оно оставалось открытым после повторного нажатия по ноте
        this.closeDurationMenus();
        if (this.selectedNoteId) {
            const note = this.notes.find(n => n.id === this.selectedNoteId);
            if (note) {
                note.element.classList.remove('selected');
            }
        }
        
        this.selectedNoteId = null;
        document.getElementById('selected-note').textContent = t('app.none');
        document.getElementById('selected-note-info').textContent = t('staff.noSelection');
        
        // Отключаем кнопки управления
        document.getElementById('btn-note-up').disabled = true;
        document.getElementById('btn-note-down').disabled = true;
        document.getElementById('btn-delete-note').disabled = true;
        document.getElementById('btn-insert-note').disabled = true;
        
        // Очищаем аппликатуры
        this.clearFingering();
        this.updateBarLineButtons();
        
        this.updateStatus(t('status.deselected'));
    }
    
    updateNoteCount() {
        const notes = this.notes.filter(n => !n.isRest).length;
        const rests = this.notes.length - notes;
        document.getElementById('note-count').textContent = rests > 0
            ? t('notes.countWithRests', { n: notes, m: rests, word: I18n.plural('rests.short', rests) })
            : t('notes.count', { n: notes });
    }
    
    changeSelectedNotePitch(direction) {
        if (!this.selectedNoteId) return false;
        
        const note = this.notes.find(n => n.id === this.selectedNoteId);
        if (!note) return false;
        
        if (note.isRest) {
            this.updateStatus(t('status.restNoPitch'));
            return false;
        }
        
        // Получаем следующую ноту в последовательности
        const newNoteName = this.getNextNoteInSequence(note.noteName, direction);
        
        if (newNoteName === note.noteName) {
            this.updateStatus(t('status.pitchLimit'));
            return false;
        }
        
        // Получаем информацию о новой ноте
        const newNoteInfo = this.getNoteInfoByName(newNoteName);
        
        // Находим позицию для новой ноты
        const newPosition = this.positions.find(p => p.id === newNoteInfo.positionId);
        if (!newPosition) {
            this.updateStatus(t('status.positionMissing', { position: newNoteInfo.positionId, name: newNoteName }));
            return false;
        }
        
        // Обновляем ноту
        this.pushHistory();
        note.positionId = newNoteInfo.positionId;
        note.noteName = newNoteName;
        note.displayName = newNoteInfo.displayName;
        note.accidental = this.accidentalOf(newNoteInfo.displayName);
        note.fingering = newNoteInfo.fingering;
        note.fingeringBase = newNoteInfo.fingering ? newNoteInfo.fingering.replace(/_v\d+\.jpg$/, '') : null;
        note.hasFingering = newNoteInfo.hasFingering;
        note.variants = newNoteInfo.variants || 1;
        // Выбранный вариант сохраняем, если он есть у новой ноты
        note.currentVariant = Math.min(note.currentVariant || 1, note.variants);
        if (note.fingeringBase) {
            note.fingering = `${note.fingeringBase}_v${note.currentVariant}.jpg`;
        }
        note.y = newPosition.y;
        note.stemUp = newPosition.y > STAFF_MIDDLE_LINE_Y;
        
        // Обновляем отображение
        note.element.style.top = newPosition.y + 'px';
        this.syncHighFlag(note.element, newPosition.y);
        note.element.setAttribute('data-stem', note.stemUp ? 'up' : 'down');
        this.syncHighFlag(note.element, newPosition.y);
        note.element.setAttribute('data-position-id', newNoteInfo.positionId);
        const label = note.element.querySelector('.note-label');
        if (label) label.textContent = this.displayNoteName(newNoteInfo.displayName);
        this.refreshElement(note);
        
        document.getElementById('selected-note').textContent = newNoteInfo.displayName;
        document.getElementById('selected-note-info').textContent = t('note.info', { name: newNoteInfo.displayName, position: newNoteInfo.positionId });
        
        // Обновляем аппликатуры
        this.updateFingering(note);
        
        this.updateStatus(t('status.noteChanged', { name: newNoteInfo.displayName }));
        this.scheduleAutosave();
        this.playNotePreview(note);
        return true;
    }
    
    // Признак высокой ноты: у нот у верха стана окошко длительности
    // раскрывается вниз, иначе его закрывает шапка строки. Признак надо
    // пересчитывать при каждом изменении высоты, а не только при создании
    syncHighFlag(element, y) {
        if (!element) return;
        if (y < 50) element.setAttribute('data-high', '1');
        else element.removeAttribute('data-high');
    }
    // Короткое звучание одной ноты: при постановке, клике и смене высоты,
    // чтобы сразу слышать, что получается. Во время проигрывания молчим,
    // а при массовой загрузке мелодии - тем более: там нот десятки.
    // Отсчёт перед началом: три секунды с крупными цифрами по центру.
    // Щелчки идут, только если включён метроном
    runCountIn(callback) {
        const overlay = document.getElementById('count-in');
        const steps = 3;

        // Экран переводим сразу: за время отсчёта видно, откуда пойдёт игра
        this.followPlayback(this.notes[0], { instant: true });

        if (this.metronome && this.melodyPlayer) {
            this.melodyPlayer.countInClicks(steps, 1);
        }

        if (!overlay) {
            callback();
            return;
        }

        let left = steps;
        overlay.textContent = left;
        overlay.hidden = false;

        this.countInTimer = setInterval(() => {
            left -= 1;

            if (left <= 0) {
                this.clearCountIn();
                callback();
                return;
            }

            overlay.textContent = left;
        }, 1000);
    }

    // Снять отсчёт: и таймер, и цифры
    clearCountIn() {
        if (this.countInTimer) {
            clearInterval(this.countInTimer);
            this.countInTimer = null;
        }

        const overlay = document.getElementById('count-in');
        if (overlay) {
            overlay.hidden = true;
            overlay.textContent = '';
        }
    }

    playNotePreview(element) {
        if (!element || element.isRest || this.loading) return false;
        if (!this.melodyPlayer || this.melodyPlayer.playing) return false;
        if (!Playback.audioSupported()) return false;
        
        const frequency = Playback.noteToFrequency(element.noteName || element.displayName, this.soundSemitones());
        if (!frequency) return false;
        
        const ctx = this.melodyPlayer.ensureContext();
        if (!ctx) return false;
        if (ctx.state === 'suspended' && ctx.resume) ctx.resume();
        
        // Длительность берём у самой ноты, но в разумных пределах:
        // целая на медленном темпе тянулась бы слишком долго
        const seconds = Math.min(1.2, Math.max(0.35, Playback.secondsFor(element, this.tempo)));
        
        // Предыдущее озвучивание гасим: при частом нажатии стрелок ноты
        // иначе накладывались бы друг на друга
        this.stopNotePreview();
        this.previewVoices = this.melodyPlayer.scheduleNote(
            frequency, ctx.currentTime + 0.02, seconds) || [];
        
        return true;
    }
    
    // Погасить озвучивание отдельной ноты, не трогая проигрывание мелодии
    stopNotePreview() {
        const voices = this.previewVoices || [];
        this.previewVoices = [];
        
        voices.forEach(voice => {
            try { voice.stop(); } catch (e) { /* уже остановлен */ }
            try { voice.disconnect(); } catch (e) { /* уже отключён */ }
        });
    }
    
    // Перемещение по нотам стрелками: выделяем соседнюю и озвучиваем её
    moveSelection(direction) {        if (!this.notes.length) return false;
        
        const current = this.notes.findIndex(note => note.id === this.selectedNoteId);
        let index;
        
        if (current === -1) {
            // Ничего не выделено: идём с того края, в сторону которого шагаем
            index = direction > 0 ? 0 : this.notes.length - 1;
        } else {
            index = current + direction;
            if (index < 0 || index >= this.notes.length) return false;
        }
        
        const note = this.notes[index];
        this.selectNote(note.id);
        this.playNotePreview(note);
        
        // Во время проигрывания прокруткой управляет оно само
        if (!this.melodyPlayer || !this.melodyPlayer.playing) {
            this.followPlayback(note);
        }
        
        return true;
    }
    
    // Выделенный элемент мелодии, если он есть
    selectedElement() {
        if (!this.selectedNoteId) return null;
        return this.notes.find(note => note.id === this.selectedNoteId) || null;
    }
    
    // Снимок мелодии для отката. Формат тот же, что и в файле сохранения,
    // поэтому восстановление идёт обычной загрузкой мелодии.
    historySnapshot() {
        const data = this.serializeMelody();
        return {
            elements: data.elements,
            settings: data.settings,
            // Место выделенной ноты: при восстановлении идентификаторы новые,
            // поэтому запоминаем позицию в мелодии, а не идентификатор
            selectedIndex: this.notes.findIndex(note => note.id === this.selectedNoteId)
        };
    }
    
    // Запомнить состояние перед изменением. Держим не больше HISTORY_LIMIT
    // шагов: больше обычного не откатывают, а память не бесконечная.
    pushHistory() {
        if (this.restoring || this.loading) return;
        
        this.history.push(this.historySnapshot());
        if (this.history.length > HISTORY_LIMIT) this.history.shift();
        
        // Новое действие обрывает ветку возврата
        this.redoHistory.length = 0;
        this.updateHistoryButtons();
    }
    
    undo() {
        return this.stepHistory(this.history, this.redoHistory, 'status.undone', 'status.nothingToUndo');
    }
    
    redo() {
        return this.stepHistory(this.redoHistory, this.history, 'status.redone', 'status.nothingToRedo');
    }
    
    // Общий шаг отката и возврата: состояние уходит в обратную стопку
    stepHistory(from, to, doneKey, emptyKey) {
        if (!from.length) {
            this.updateStatus(t(emptyKey));
            return false;
        }
        
        to.push(this.historySnapshot());
        if (to.length > HISTORY_LIMIT) to.shift();
        
        // Запоминаем прокрутку: мелодия перестраивается целиком, и без этого
        // после отката нас возвращало бы к началу стана
        const scrollArea = document.querySelector('.scrollable-area');
        const scrollTop = scrollArea ? scrollArea.scrollTop : 0;
        
        const target = from.pop();

        this.restoring = true;
        this.applyMelody(target);
        this.restoring = false;
        
        if (scrollArea) scrollArea.scrollTop = scrollTop;
        
        // Выделение берём из восстановленного состояния, а не из текущего:
        // иначе после добавления или вставки выделять было бы нечего
        const restoreIndex = target.selectedIndex;
        if (restoreIndex >= 0 && this.notes[restoreIndex]) {
            this.selectNote(this.notes[restoreIndex].id);
        }
        
        this.updateHistoryButtons();
        this.updateStatus(t(doneKey));
        this.scheduleAutosave();
        
        return true;
    }
    
    updateHistoryButtons() {
        const undoButton = document.getElementById('btn-undo');
        const redoButton = document.getElementById('btn-redo');
        
        if (undoButton) undoButton.disabled = this.history.length === 0;
        if (redoButton) redoButton.disabled = this.redoHistory.length === 0;
    }
    
    // Alt со стрелкой вверх или вниз меняет длительность выделенного элемента
    changeSelectedDuration(direction) {
        const element = this.selectedElement();
        if (!element) return false;

        // Из файла длительность может прийти строкой, поэтому приводим к числу
        const index = DURATION_LADDER.indexOf(Number(element.duration));
        if (index === -1) return false;

        // direction 1 - длиннее, а лесенка начинается с самой длинной
        const next = index - direction;
        if (next < 0 || next >= DURATION_LADDER.length) {
            this.updateStatus(t('status.durationLimit'));
            return false;
        }

        const duration = DURATION_LADDER[next];
        this.pushHistory();
        this.setElementDuration(element, duration, { history: false });

        // Точки остаются как были: их ставят отдельно, кнопками в окошке
        this.updateStatus(t(element.dotted ? 'status.durationSetDotted' : 'status.durationSet',
            { name: this.durationLabel(duration) }));

        return true;
    }
    
    // Insert вставляет ноту перед выделенной, той же высоты, что предыдущая.
    // Выделение переходит на вставленную.
    insertNoteBefore() {
        const element = this.selectedElement();
        const index = element ? this.notes.indexOf(element) : this.notes.length;
        
        this.pushHistory();
        // Высоту берём у предыдущей ноты, если её нет - у следующей,
        // если и её нет - у C4
        const previous = index > 0 ? this.notes[index - 1] : null;
        const next = this.notes[index] || null;
        const source = (previous && !previous.isRest) ? previous
            : ((next && !next.isRest) ? next : null);
        
        const noteName = source ? (source.noteName || source.displayName) : 'C4';
        const noteInfo = this.getNoteInfoByName(noteName);
        if (!noteInfo || !noteInfo.positionId) return false;
        
        // Историю пишем только когда вставка точно состоится
        this.pushHistory();

        const noteId = this.addNote(noteInfo.positionId, noteName, index, { silent: true });
        if (!noteId) return false;
        
        const note = this.notes.find(n => n.id === noteId);
        if (!note) return false;
        
        // Длительность берём у соседа: вставляем в мелодию, а не в пустоту
        if (source) {
            note.duration = source.duration || 4;
            note.dotted = !!source.dotted;
        }
        
        this.relayout();
        this.selectNote(noteId);
        this.playNotePreview(note);
        this.updateStatus(t('status.noteInserted', { name: note.displayName }));
        this.scheduleAutosave();
        
        return true;
    }
    
    // Shift+Insert вставляет паузу перед выделенным элементом
    insertRestBefore() {
        const element = this.selectedElement();
        const index = element ? this.notes.indexOf(element) : this.notes.length;
        
        this.pushHistory();
        const restId = this.addRest(index, { silent: true });
        if (!restId) return false;
        
        this.relayout();
        this.selectNote(restId);
        this.updateStatus(t('status.restInserted'));
        this.scheduleAutosave();
        
        return true;
    }
    
    deleteSelectedNote() {
        if (!this.selectedNoteId) return false;
        
        const noteIndex = this.notes.findIndex(n => n.id === this.selectedNoteId);
        if (noteIndex === -1) return false;
        
        const note = this.notes[noteIndex];
        
        this.pushHistory();
        note.element.remove();
        this.notes.splice(noteIndex, 1);
        
        this.deselectNote();
        this.relayout();
        
        this.updateStatus(note.isRest ? t('status.restDeleted') : t('status.noteDeleted', { name: note.displayName }));
        this.scheduleAutosave();
        return true;
    }
    
    clearAllNotes() {
        this.notes.forEach(note => {
            note.element.remove();
        });
        this.notes = [];
        this.clearNotationMarks();
        this.deselectNote();
        this.relayout();
        
        this.updateStatus(t('status.allCleared'));
        this.scheduleAutosave();
    }
    
    transposeAllNotes(direction) {
        if (this.notes.length === 0) {
            this.updateStatus(t('status.noNotesToTranspose'));
            return false;
        }
        
        this.pushHistory();
        
        let changedCount = 0;
        const selectedNoteId = this.selectedNoteId;
        
        // Снимаем выделение, чтобы избежать конфликтов
        this.deselectNote();
        
        // Транспонируем все ноты (паузы не трогаем)
        this.notes.forEach(note => {
            if (note.isRest) return;
            
            // Получаем следующую ноту в последовательности
            const newNoteName = this.getNextNoteInSequence(note.noteName, direction);
            
            if (newNoteName === note.noteName) {
                return; // Невозможно изменить высоту ноты (достигнут предел диапазона)
            }
            
            // Получаем информацию о новой ноте
            const newNoteInfo = this.getNoteInfoByName(newNoteName);
            
            // Находим позицию для новой ноты
            const newPosition = this.positions.find(p => p.id === newNoteInfo.positionId);
            if (!newPosition) {
                return;
            }
            
            // Обновляем ноту
            note.positionId = newNoteInfo.positionId;
            note.noteName = newNoteName;
            note.displayName = newNoteInfo.displayName;
            note.accidental = this.accidentalOf(newNoteInfo.displayName);
            note.fingering = newNoteInfo.fingering;
            note.fingeringBase = newNoteInfo.fingering ? newNoteInfo.fingering.replace(/_v\d+\.jpg$/, '') : null;
            note.hasFingering = newNoteInfo.hasFingering;
            note.variants = newNoteInfo.variants || 1;
            // Выбранный вариант сохраняем, если он есть у новой ноты
            note.currentVariant = Math.min(note.currentVariant || 1, note.variants);
            if (note.fingeringBase) {
                note.fingering = `${note.fingeringBase}_v${note.currentVariant}.jpg`;
            }
            note.y = newPosition.y;
            note.stemUp = newPosition.y > STAFF_MIDDLE_LINE_Y;
            
            // Обновляем отображение
            note.element.style.top = newPosition.y + 'px';
        this.syncHighFlag(note.element, newPosition.y);
            note.element.setAttribute('data-stem', note.stemUp ? 'up' : 'down');
            note.element.setAttribute('data-position-id', newNoteInfo.positionId);
            const label = note.element.querySelector('.note-label');
            if (label) label.textContent = this.displayNoteName(newNoteInfo.displayName);
            this.refreshElement(note);
            
            changedCount++;
        });
        
        // Восстанавливаем выделение, если была выделена нота
        if (selectedNoteId && this.notes.find(n => n.id === selectedNoteId)) {
            this.selectNote(selectedNoteId);
        }
        
        // Обновляем аппликатуры
        this.updateAllFingerings();
        
        this.updateStatus(t('status.transposed', { n: changedCount }));
        this.scheduleAutosave();
        return changedCount > 0;
    }
    
    updateFingering(note) {
        // Обновляем все аппликатуры для всех нот
        this.updateAllFingerings();
        
        // Выделяем карточку текущей ноты
        const cards = document.querySelectorAll('.fingering-card');
        cards.forEach(card => {
            card.classList.remove('selected');
            if (card.getAttribute('data-note-id') === note.id) {
                card.classList.add('selected');
            }
        });
        
        // Обновляем информацию о выделенном элементе
        this.setFingeringInfo(note.isRest
            ? t('rest.inRow', { name: this.durationLabel(note.duration) })
            : note.displayName);
    }
    
    // Переключение варианта аппликатуры
    changeFingeringVariant(direction) {
        if (!this.selectedNoteId) {
            this.updateStatus(t('staff.noSelection'));
            return false;
        }
        
        const note = this.notes.find(n => n.id === this.selectedNoteId);
        if (!note) return false;
        
        if (note.isRest) {
            this.updateStatus(t('status.restNoFingering'));
            return false;
        }
        
        if (!note.hasFingering || note.variants <= 1) {
            this.updateStatus(t('status.noVariants'));
            return false;
        }
        
        // Вычисляем новый вариант
        let newVariant = note.currentVariant + direction;
        
        // Проверяем границы
        if (newVariant < 1) newVariant = note.variants;
        if (newVariant > note.variants) newVariant = 1;
        
        if (newVariant === note.currentVariant) {
            return false;
        }
        
        // Обновляем текущий вариант
        note.currentVariant = newVariant;
        
        // Обновляем имя файла аппликатуры с учетом варианта
        // Заменяем _v1 на _v2, _v3 и т.д.
        if (note.fingeringBase) {
            note.fingering = `${note.fingeringBase}_v${newVariant}.jpg`;
        }
        
        // Тот же выбор переносим на все ноты с такой же аппликатурой: одна и та
        // же высота должна играться одинаково. Такие шаги для отката не храним -
        // это настройка показа, а не правка мелодии.
        const twins = this.notes.filter(other =>
            other !== note && !other.isRest && other.fingeringBase === note.fingeringBase);
        
        let updated = 0;
        twins.forEach(other => {
            const variant = Math.min(newVariant, other.variants || 1);
            if (other.currentVariant === variant) return;
            
            other.currentVariant = variant;
            other.fingering = `${other.fingeringBase}_v${variant}.jpg`;
            updated++;
        });
        
        // Обновляем отображение
        this.updateFingering(note);
        
        if (updated > 0) {
            this.updateStatus(t('status.variantChangedMany', {
                current: newVariant, total: note.variants, count: updated + 1
            }));
        } else {
            this.updateStatus(t('status.variantChanged', { current: newVariant, total: note.variants }));
        }
        
        this.scheduleAutosave();
        return true;
    }
    
    // Размеры переключателя вариантов. Кнопки обязаны влезать в карточку
    // при любой ширине картинки, вплоть до минимальных 50px.
    variantControlMetrics() {
        const size = this.imageSize;
        const button = size < 70 ? 16 : (size < 120 ? 20 : 24);
        const gap = size < 70 ? 2 : (size < 120 ? 6 : 10);
        const panelHeight = size < 70 ? 20 : 30;
        const fontSize = size < 70 ? 9 : (size < 120 ? 11 : 12);
        
        // 2 кнопки + 2 промежутка + место под надпись вида "1/4"
        const neededWithCounter = button * 2 + gap * 2 + fontSize * 2.4;
        return {
            button: button,
            gap: gap,
            panelHeight: panelHeight,
            fontSize: fontSize,
            showCounter: neededWithCounter <= size
        };
    }
    
    updateAllFingerings() {
        // Карточки всегда строятся по текущим настройкам: загруженные
        // ноты и добавленные следом не должны расходиться
        this.recomputeFingerings();
        // Каждая строка наполняется своими карточками
        this.fingeringContainers.forEach(row => { row.innerHTML = ''; });
        
        if (this.notes.length === 0) {
            this.showNoFingeringsPlaceholder();
            this.updateStaffTail();
            return;
        }
        
        let fingeringCount = 0;
        
        this.notes.forEach(note => {
            const container = this.fingeringContainers[note.system || 0] || this.fingeringContainers[0];
            if (!container) return;
            
            // Напротив паузы аппликатуры нет, но место сохраняем - иначе сдвинется выравнивание
            if (note.isRest) {
                const spacer = document.createElement('div');
                spacer.className = 'fingering-spacer';
                spacer.setAttribute('data-note-id', note.id);
                spacer.style.boxSizing = 'border-box';
                spacer.style.width = (this.imageSize + 2) + 'px';
                spacer.style.margin = '0px';
                spacer.style.padding = '0px';
                spacer.style.height = '200px';
                container.appendChild(spacer);
                return;
            }
            
            // Создаем карточку аппликатуры напрямую без дополнительных оберток
            const card = document.createElement('div');
            card.className = 'fingering-card fade-in';
            if (note.id === this.selectedNoteId) {
                card.classList.add('selected');
            }
            card.setAttribute('data-note-id', note.id);
            // Внешняя ширина карточки ровно равна шагу ноты. Задаём её целиком,
            // через border-box и с нулевыми отступами: любого из этих слагаемых
            // достаточно, чтобы шаг карточек разошёлся с шагом нот,
            // а расхождение копится от первой ноты к последней.
            card.style.boxSizing = 'border-box';
            card.style.width = (this.imageSize + 2) + 'px';
            card.style.margin = '0px';
            card.style.padding = '0px';
            // Высота зависит от наличия вариантов: 200px для одной аппликатуры, 230px для нескольких вариантов
            const cardHeight = note.hasFingering && note.variants > 1 ? '230px' : '200px';
            card.style.height = cardHeight;
            card.style.display = 'flex';
            card.style.flexDirection = 'column';
            card.style.alignItems = 'center';
            card.style.justifyContent = 'flex-start';
            card.style.borderRadius = '0'; // Убираем скругления для плотного прилегания
            card.style.overflow = 'hidden';
            card.style.background = 'white';
            card.style.cursor = 'pointer';
            card.style.transition = 'all 0.2s';
            card.style.margin = '0'; // Убираем маржины
            card.style.padding = '0'; // Убираем паддинги
            
            if (note.hasFingering) {
                // Создаем контейнер для изображения
                const imgContainer = document.createElement('div');
                imgContainer.style.width = '100%';
                imgContainer.style.height = '100%'; // Занимаем всю высоту карточки
                imgContainer.style.overflow = 'hidden';
                imgContainer.style.display = 'flex';
                imgContainer.style.alignItems = 'center';
                imgContainer.style.justifyContent = 'center';
                
                const img = document.createElement('img');
                img.className = 'fingering-image';
                // Декодируем вне главного потока: синхронное декодирование
                // большой картинки в момент подсветки давало рывки
                img.decoding = 'async';
                // Путь берём из кэша, если он доступен; иначе - напрямую из папки
                img.src = this.imageUrl(note.fingering);
                img.alt = t('card.imageAlt', { name: note.displayName });
                img.style.width = '100%';
                img.style.height = '100%';
                img.style.objectFit = 'contain';
                img.style.display = 'block';
                img.style.margin = '0';
                img.style.padding = '0';
                
                imgContainer.appendChild(img);
                card.appendChild(imgContainer);
                fingeringCount++;
                
                // Добавляем панель управления вариантами, если есть несколько вариантов
                if (note.variants > 1) {
                    const metrics = this.variantControlMetrics();
                    
                    const controlsPanel = document.createElement('div');
                    controlsPanel.className = 'fingering-controls';
                    controlsPanel.style.width = '100%';
                    controlsPanel.style.height = metrics.panelHeight + 'px';
                    controlsPanel.style.display = 'flex';
                    controlsPanel.style.alignItems = 'center';
                    controlsPanel.style.justifyContent = 'center';
                    controlsPanel.style.gap = metrics.gap + 'px';
                    controlsPanel.style.background = '#f8f9fa';
                    controlsPanel.style.borderTop = '1px solid #e2e8f0';
                    controlsPanel.style.fontSize = metrics.fontSize + 'px';
                    controlsPanel.style.color = '#4a5568';
                    controlsPanel.style.padding = '0';
                    controlsPanel.style.overflow = 'hidden';
                    
                    // Кнопка "влево"
                    const prevBtn = document.createElement('button');
                    prevBtn.innerHTML = '&larr;';
                    prevBtn.style.background = 'none';
                    prevBtn.style.border = '1px solid #cbd5e0';
                    prevBtn.style.borderRadius = '3px';
                    prevBtn.style.width = metrics.button + 'px';
                    prevBtn.style.height = metrics.button + 'px';
                    prevBtn.style.flex = '0 0 auto';
                    prevBtn.style.cursor = 'pointer';
                    prevBtn.style.fontSize = (metrics.fontSize + 2) + 'px';
                    prevBtn.style.lineHeight = '1';
                    prevBtn.style.padding = '0';
                    prevBtn.style.color = '#000000';
                    prevBtn.style.fontWeight = 'bold';
                    prevBtn.style.webkitTextStroke = '0.4px #000000';
                    prevBtn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        if (note.id === this.selectedNoteId) {
                            this.changeFingeringVariant(-1);
                        } else {
                            // Если нота не выделена, сначала выделяем ее
                            this.selectNote(note.id);
                            // Затем меняем вариант
                            setTimeout(() => this.changeFingeringVariant(-1), 10);
                        }
                    });
                    
                    // Номер варианта
                    const variantText = document.createElement('span');
                    variantText.textContent = `${note.currentVariant}/${note.variants}`;
                    variantText.style.fontWeight = 'bold';
                    variantText.style.flex = '0 0 auto';
                    
                    // Кнопка "вправо"
                    const nextBtn = document.createElement('button');
                    nextBtn.innerHTML = '&rarr;';
                    nextBtn.style.background = 'none';
                    nextBtn.style.border = '1px solid #cbd5e0';
                    nextBtn.style.borderRadius = '3px';
                    nextBtn.style.width = metrics.button + 'px';
                    nextBtn.style.height = metrics.button + 'px';
                    nextBtn.style.flex = '0 0 auto';
                    nextBtn.style.cursor = 'pointer';
                    nextBtn.style.fontSize = (metrics.fontSize + 2) + 'px';
                    nextBtn.style.lineHeight = '1';
                    nextBtn.style.padding = '0';
                    nextBtn.style.color = '#000000';
                    nextBtn.style.fontWeight = 'bold';
                    nextBtn.style.webkitTextStroke = '0.4px #000000';
                    nextBtn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        if (note.id === this.selectedNoteId) {
                            this.changeFingeringVariant(1);
                        } else {
                            // Если нота не выделена, сначала выделяем ее
                            this.selectNote(note.id);
                            // Затем меняем вариант
                            setTimeout(() => this.changeFingeringVariant(1), 10);
                        }
                    });
                    
                    controlsPanel.appendChild(prevBtn);
                    // Номер варианта убираем на самых узких карточках, чтобы кнопки влезли
                    if (metrics.showCounter) controlsPanel.appendChild(variantText);
                    controlsPanel.appendChild(nextBtn);
                    card.appendChild(controlsPanel);
                }
            } else {
                card.style.background = '#f8f9fa';
                card.style.display = 'flex';
                card.style.alignItems = 'center';
                card.style.justifyContent = 'center';
                card.innerHTML = `<div style="text-align: center; color: #a0aec0; font-size: 12px; padding: 0; margin: 0;">${t('card.noFingering')}</div>`;
            }
            
            container.appendChild(card);
            
            // Добавляем обработчик клика для выбора ноты
            card.addEventListener('click', () => {
                this.selectNote(note.id);
                this.playNotePreview(note);
            });
        });
        
        const countNode = document.getElementById('fingering-count');
        if (countNode) countNode.textContent = t('cards.count', { n: fingeringCount });
        
        this.renderMeasureDividers();
        this.updateStaffTail();
    }
    
    // Запас под последней строкой, кратный её высоте: чтобы последнюю строку
    // можно было подтянуть наверх и читать её на удобной высоте.
    // Добавляем только когда мелодия и так не помещается целиком.
    updateStaffTail() {
        const tail = this.staffTail;
        if (!tail) return;
        
        tail.style.height = '0px';
        
        const area = document.querySelector('.scrollable-area');
        if (!area || this.staffContainers.length < 2) return;
        
        const lastStaff = this.staffContainers[this.staffContainers.length - 1];
        const lastSystem = lastStaff ? lastStaff.closest('.system') : null;
        const step = lastSystem ? lastSystem.offsetHeight : 0;
        if (!step) return;
        
        if (this.container.scrollHeight <= area.clientHeight + 1) return;
        
        const need = Math.max(step, area.clientHeight - step);
        tail.style.height = (Math.ceil(need / step) * step) + 'px';
    }
    
    // Границы тактов продолжаются в ряду аппликатур. Координату берём у самой
    // карточки, а не считаем от ноты: тогда черта всегда стоит на её краю,
    // как бы браузер ни разложил карточки.
    renderMeasureDividers() {
        const marks = this.computeBarLines();
        
        this.notes.forEach(element => {
            if (!marks.has(element.id)) return;
            
            const row = this.fingeringContainers[element.system || 0];
            if (!row) return;
            
            const card = row.querySelector('.fingering-card[data-note-id="' + element.id + '"], ' +
                '.fingering-spacer[data-note-id="' + element.id + '"]');
            if (!card) return;
            
            const divider = document.createElement('div');
            divider.className = 'measure-divider';
            divider.style.left = (card.offsetLeft + card.offsetWidth) + 'px';
            row.appendChild(divider);
        });
    }
    
    // Сведения о выбранной аппликатуре в шапке (может отсутствовать в разметке)
    setFingeringInfo(text) {
        const node = document.getElementById('current-fingering-info');
        if (node) node.textContent = text;
    }
    
    showNoFingeringsPlaceholder() {
        const container = this.fingeringContainers[0];
        if (!container) return;
        
        container.innerHTML = '';
        
        const placeholder = document.createElement('div');
        placeholder.className = 'fingering-placeholder fade-in';
        
        const icon = document.createElement('div');
        icon.className = 'placeholder-icon';
        icon.innerHTML = '<i class="fas fa-music"></i>';
        
        const text = document.createElement('div');
        text.className = 'placeholder-text';
        text.textContent = t('cards.placeholderText');
        
        placeholder.appendChild(icon);
        placeholder.appendChild(text);
        container.appendChild(placeholder);
        
        const countNode = document.getElementById('fingering-count');
        if (countNode) countNode.textContent = t('cards.none');
        this.setFingeringInfo(t('staff.noSelection'));
    }
    
    showNoFingeringPlaceholder(noteName) {
        const container = this.fingeringContainers[0];
        if (!container) return;
        
        container.innerHTML = '';
        
        const placeholder = document.createElement('div');
        placeholder.className = 'fingering-placeholder fade-in';
        
        const icon = document.createElement('div');
        icon.className = 'placeholder-icon';
        icon.innerHTML = '<i class="fas fa-times-circle"></i>';
        
        const text = document.createElement('div');
        text.className = 'placeholder-text';
        text.textContent = t('cards.noFingeringFor', { name: noteName });
        
        placeholder.appendChild(icon);
        placeholder.appendChild(text);
        container.appendChild(placeholder);
        
        const countNode = document.getElementById('fingering-count');
        if (countNode) countNode.textContent = t('cards.none');
        this.setFingeringInfo(t('cards.noFingeringFor', { name: noteName }));
    }
    
    clearFingering() {
        this.updateAllFingerings();
    }
    
    updateImageSize(newSize) {
        this.imageSize = newSize;
        
        const value = document.getElementById('image-size-value');
        if (value) value.textContent = newSize + 'px';
        
        // Размер карточек и раскладка строк пересчитываются заново
        this.relayout();
    }
    
    // Раскладка мелодии по строкам: системы, координаты, черты и аппликатуры.
    // Разбивка на строки описана в computeSystems.
    updateNotePositions() {
        // Масштаб строки считаем до раскладки: от него зависит, сколько
        // нот помещается в строку на этом экране
        this.systemScaleValue = this.systemScale();
        
        // Ширина строки зависит от того, появилась ли вертикальная прокрутка,
        // а прокрутка - от числа строк. Поэтому считаем раскладку, пока она
        // не установится: иначе карточки сжимаются и расходятся с чертами.
        let systems = this.computeSystems();
        this.syncSystems(systems.length);
        
        for (let pass = 0; pass < 5; pass++) {
            const next = this.computeSystems();
            const changed = next.length !== systems.length;
            systems = next;
            if (!changed) break;
            this.syncSystems(systems.length);
        }
        
        this.applySystemScale();
        
        const slot = this.imageSize + 2;
        
        systems.forEach((system, systemIndex) => {

        const staff = this.staffContainers[systemIndex];
            if (!staff) return;
            
            system.forEach((element, position) => {
                element.system = systemIndex;
                element.lastInSystem = position === system.length - 1;
                element.x = STAFF_CLEF_WIDTH + slot / 2 + position * slot;
                element.element.style.left = element.x + 'px';
                element.element.style.top = element.y + 'px';
                
                if (element.element.parentElement !== staff) {
                    staff.appendChild(element.element);
                }
            });
        });
        
        this.applyStaffMetrics();
        
        // Черты и знаки репризы привязаны к координатам, поэтому перерисовываем их
        this.renderNotationMarks();
    }
    
    // Что занимает элемент по вертикали: окошко длительности сверху, подпись снизу
    elementExtent(element) {
        if (element.isRest) return { top: 58, bottom: 22 };
        return element.stemUp ? { top: 78, bottom: 30 } : { top: 42, bottom: 68 };
    }
    
    // Стан подгоняется под фактическое содержимое мелодии: иначе сверху
    // и между станом и аппликатурами остаются пустые полосы.
    systemMetrics() {
        let top = STAFF_TOP_LEDGER;
        let bottom = STAFF_BOTTOM_LEDGER;
        
        this.notes.forEach(element => {
            const extent = this.elementExtent(element);
            if (element.y - extent.top < top) top = element.y - extent.top;
            if (element.y + extent.bottom > bottom) bottom = element.y + extent.bottom;
        });
        
        const offset = Math.max(0, Math.ceil(top) - 6); // 6px поля сверху
        const height = Math.max(140, Math.ceil(bottom - offset + 8));
        return { offset: offset, height: height };
    }
    
    applyStaffMetrics() {
        const metrics = this.systemMetrics();
        
        this.staffContainers.forEach(staff => {
            const wrapper = staff.parentElement;
            if (wrapper) wrapper.style.height = metrics.height + 'px';
            staff.style.transform = 'translateY(-' + metrics.offset + 'px)';
        });
    }
    
    
    updateNoteNamesVisibility(show) {
        this.showNoteNames = show;
        
        this.notes.forEach(note => {
            if (note.isRest) return;
            
            const existing = note.element.querySelector('.note-label');
            if (show && !existing) {
                note.element.insertAdjacentHTML('beforeend', `<div class="note-label">${this.displayNoteName(note.displayName)}</div>`);
            } else if (!show && existing) {
                existing.remove();
            }
        });
    }
    
    // Получение следующей ноты в последовательности (вверх или вниз)
    getNextNoteInSequence(currentNoteName, direction = 1) {
        // direction: 1 = вверх, -1 = вниз
        
        // Определяем последовательность в зависимости от стратегии
        const sequence = this.getNoteSequence();
        
        // Находим индекс текущей ноты в последовательности
        const currentIndex = sequence.indexOf(currentNoteName);
        
        if (currentIndex === -1) {
            console.error('Нота не найдена в последовательности:', currentNoteName);
            return currentNoteName;
        }
        
        // Вычисляем новый индекс
        let newIndex = currentIndex + direction;
        
        // Проверяем границы
        if (newIndex < 0) newIndex = 0;
        if (newIndex >= sequence.length) newIndex = sequence.length - 1;
        
        return sequence[newIndex];
    }
    
    // Получение последовательности нот в зависимости от стратегии
    getNoteSequence() {
        if (this.displayMode === 'sharps') {
            // Последовательность с диезами
            return [
                'C2', 'C#2', 'D2', 'D#2', 'E2', 'F2', 'F#2', 'G2', 'G#2', 'A2', 'A#2', 'B2',
                'C3', 'C#3', 'D3', 'D#3', 'E3', 'F3', 'F#3', 'G3', 'G#3', 'A3', 'A#3', 'B3',
                'C4', 'C#4', 'D4', 'D#4', 'E4', 'F4', 'F#4', 'G4', 'G#4', 'A4', 'A#4', 'B4',
                'C5', 'C#5', 'D5', 'D#5', 'E5', 'F5', 'F#5', 'G5', 'G#5', 'A5',
            'A#5', 'B5', 'C6', 'C#6', 'D6', 'D#6', 'E6', 'F6', 'F#6'
            ];
        } else {
            // Последовательность с бемолями
            return [
                'C2', 'Db2', 'D2', 'Eb2', 'E2', 'F2', 'Gb2', 'G2', 'Ab2', 'A2', 'Bb2', 'B2',
                'C3', 'Db3', 'D3', 'Eb3', 'E3', 'F3', 'Gb3', 'G3', 'Ab3', 'A3', 'Bb3', 'B3',
                'C4', 'Db4', 'D4', 'Eb4', 'E4', 'F4', 'Gb4', 'G4', 'Ab4', 'A4', 'Bb4', 'B4',
                'C5', 'Db5', 'D5', 'Eb5', 'E5', 'F5', 'Gb5', 'G5', 'Ab5', 'A5',
            'Bb5', 'B5', 'C6', 'Db6', 'D6', 'Eb6', 'E6', 'F6', 'Gb6'
            ];
        }
    }
    
    // Получение информации о ноте по имени (упрощенная версия на основе JSON)
    getNoteInfoByName(noteName) {
        // Упрощенное сопоставление на основе данных из JSON.
        // Карта строится один раз: она же используется для списка файлов аппликатур.
        const noteMap = this._noteMap || (this._noteMap = {
            'C2': { positionId: 1, displayName: 'C2', hasFingering: false, fingering: null, variants: 1 },
            'C#2': { positionId: 1, displayName: 'C#2', hasFingering: false, fingering: null, variants: 1 },
            'Cb2': { positionId: 1, displayName: 'Cb2', hasFingering: false, fingering: null, variants: 1 },
            'D2': { positionId: 2, displayName: 'D2', hasFingering: false, fingering: null, variants: 1 },
            'D#2': { positionId: 2, displayName: 'D#2', hasFingering: false, fingering: null, variants: 1 },
            'Db2': { positionId: 2, displayName: 'Db2', hasFingering: false, fingering: null, variants: 1 },
            'E2': { positionId: 3, displayName: 'E2', hasFingering: false, fingering: null, variants: 1 },
            'Eb2': { positionId: 3, displayName: 'Eb2', hasFingering: false, fingering: null, variants: 1 },
            'F2': { positionId: 4, displayName: 'F2', hasFingering: false, fingering: null, variants: 1 },
            'F#2': { positionId: 4, displayName: 'F#2', hasFingering: false, fingering: null, variants: 1 },
            'G2': { positionId: 5, displayName: 'G2', hasFingering: false, fingering: null, variants: 1 },
            'G#2': { positionId: 5, displayName: 'G#2', hasFingering: false, fingering: null, variants: 1 },
            'Gb2': { positionId: 5, displayName: 'Gb2', hasFingering: false, fingering: null, variants: 1 },
            'A2': { positionId: 6, displayName: 'A2', hasFingering: false, fingering: null, variants: 1 },
            'A#2': { positionId: 6, displayName: 'A#2', hasFingering: false, fingering: null, variants: 1 },
            'Ab2': { positionId: 6, displayName: 'Ab2', hasFingering: false, fingering: null, variants: 1 },
            'B2': { positionId: 7, displayName: 'B2', hasFingering: false, fingering: null, variants: 1 },
            'Bb2': { positionId: 7, displayName: 'Bb2', hasFingering: false, fingering: null, variants: 1 },
            'C3': { positionId: 8, displayName: 'C3', hasFingering: false, fingering: null, variants: 1 },
            'C#3': { positionId: 8, displayName: 'C#3', hasFingering: false, fingering: null, variants: 1 },
            'Cb3': { positionId: 8, displayName: 'Cb3', hasFingering: false, fingering: null, variants: 1 },
            'D3': { positionId: 9, displayName: 'D3', hasFingering: false, fingering: null, variants: 1 },
            'D#3': { positionId: 9, displayName: 'D#3', hasFingering: false, fingering: null, variants: 1 },
            'Db3': { positionId: 9, displayName: 'Db3', hasFingering: false, fingering: null, variants: 1 },
            'E3': { positionId: 10, displayName: 'E3', hasFingering: false, fingering: null, variants: 1 },
            'Eb3': { positionId: 10, displayName: 'Eb3', hasFingering: false, fingering: null, variants: 1 },
            'F3': { positionId: 11, displayName: 'F3', hasFingering: false, fingering: null, variants: 1 },
            'F#3': { positionId: 11, displayName: 'F#3', hasFingering: false, fingering: null, variants: 1 },
            'G3': { positionId: 12, displayName: 'G3', hasFingering: false, fingering: null, variants: 1 },
            'G#3': { positionId: 12, displayName: 'G#3', hasFingering: false, fingering: null, variants: 1 },
            'Gb3': { positionId: 12, displayName: 'Gb3', hasFingering: false, fingering: null, variants: 1 },
            'A3': { positionId: 13, displayName: 'A3', hasFingering: true, fingering: '057_A3_v1.jpg', variants: 1 },
            'A#3': { positionId: 13, displayName: 'A#3', hasFingering: true, fingering: '058_A#3_Bb3_v1.jpg', variants: 1 },
            'Ab3': { positionId: 13, displayName: 'Ab3', hasFingering: false, fingering: null, variants: 1 },
            'B3': { positionId: 14, displayName: 'B3', hasFingering: true, fingering: '059_B3_v1.jpg', variants: 1 },
            'Bb3': { positionId: 14, displayName: 'Bb3', hasFingering: true, fingering: '058_A#3_Bb3_v1.jpg', variants: 1 },
            'C4': { positionId: 15, displayName: 'C4', hasFingering: true, fingering: '060_C4_v1.jpg', variants: 1 },
            'C#4': { positionId: 15, displayName: 'C#4', hasFingering: true, fingering: '061_C#4_Db4_v1.jpg', variants: 1 },
            'Cb4': { positionId: 15, displayName: 'Cb4', hasFingering: false, fingering: null, variants: 1 },
            'D4': { positionId: 16, displayName: 'D4', hasFingering: true, fingering: '062_D4_v1.jpg', variants: 1 },
            'D#4': { positionId: 16, displayName: 'D#4', hasFingering: true, fingering: '063_D#4_Eb4_v1.jpg', variants: 1 },
            'Db4': { positionId: 16, displayName: 'Db4', hasFingering: true, fingering: '061_C#4_Db4_v1.jpg', variants: 1 },
            'E4': { positionId: 17, displayName: 'E4', hasFingering: true, fingering: '064_E4_v1.jpg', variants: 1 },
            'Eb4': { positionId: 17, displayName: 'Eb4', hasFingering: true, fingering: '063_D#4_Eb4_v1.jpg', variants: 1 },
            'F4': { positionId: 18, displayName: 'F4', hasFingering: true, fingering: '065_F4_v1.jpg', variants: 1 },
            'F#4': { positionId: 18, displayName: 'F#4', hasFingering: true, fingering: '066_F#4_Gb4_v1.jpg', variants: 1 },
            'G4': { positionId: 19, displayName: 'G4', hasFingering: true, fingering: '067_G4_v1.jpg', variants: 1 },
            'G#4': { positionId: 19, displayName: 'G#4', hasFingering: true, fingering: '068_G#4_Ab4_v1.jpg', variants: 1 },
            'Gb4': { positionId: 19, displayName: 'Gb4', hasFingering: true, fingering: '066_F#4_Gb4_v1.jpg', variants: 1 },
            'A4': { positionId: 20, displayName: 'A4', hasFingering: true, fingering: '069_A4_v1.jpg', variants: 1 },
            'A#4': { positionId: 20, displayName: 'A#4', hasFingering: true, fingering: '070_A#4_Bb4_v1.jpg', variants: 4 },
            'Ab4': { positionId: 20, displayName: 'Ab4', hasFingering: true, fingering: '068_G#4_Ab4_v1.jpg', variants: 1 },
            'B4': { positionId: 21, displayName: 'B4', hasFingering: true, fingering: '071_B4_v1.jpg', variants: 1 },
            'Bb4': { positionId: 21, displayName: 'Bb4', hasFingering: true, fingering: '070_A#4_Bb4_v1.jpg', variants: 4 },
            'C5': { positionId: 22, displayName: 'C5', hasFingering: true, fingering: '072_C5_v1.jpg', variants: 2 },
            'C#5': { positionId: 22, displayName: 'C#5', hasFingering: true, fingering: '073_C#5_Db5_v1.jpg', variants: 1 },
            'Cb5': { positionId: 22, displayName: 'Cb5', hasFingering: false, fingering: null, variants: 1 },
            'D5': { positionId: 23, displayName: 'D5', hasFingering: true, fingering: '074_D5_v1.jpg', variants: 1 },
            'D#5': { positionId: 23, displayName: 'D#5', hasFingering: true, fingering: '075_D#5_Eb5_v1.jpg', variants: 1 },
            'Db5': { positionId: 23, displayName: 'Db5', hasFingering: true, fingering: '073_C#5_Db5_v1.jpg', variants: 1 },
            'E5': { positionId: 24, displayName: 'E5', hasFingering: true, fingering: '076_E5_v1.jpg', variants: 1 },
            'Eb5': { positionId: 24, displayName: 'Eb5', hasFingering: true, fingering: '075_D#5_Eb5_v1.jpg', variants: 1 },
            'F5': { positionId: 25, displayName: 'F5', hasFingering: true, fingering: '077_F5_v1.jpg', variants: 1 },
            'F#5': { positionId: 25, displayName: 'F#5', hasFingering: true, fingering: '078_F#5_Gb5_v1.jpg', variants: 1 },
            'G5': { positionId: 26, displayName: 'G5', hasFingering: true, fingering: '079_G5_v1.jpg', variants: 1 },
            'G#5': { positionId: 26, displayName: 'G#5', hasFingering: true, fingering: '080_G#5_Ab5_v1.jpg', variants: 1 },
            'Gb5': { positionId: 26, displayName: 'Gb5', hasFingering: true, fingering: '078_F#5_Gb5_v1.jpg', variants: 1 },
            'A5': { positionId: 27, displayName: 'A5', hasFingering: true, fingering: '081_A5_v1.jpg', variants: 1 },
            'A#5': { positionId: 27, displayName: 'A#5', hasFingering: true, fingering: '082_A#5_Bb5_v1.jpg', variants: 4 },
            'Ab5': { positionId: 27, displayName: 'Ab5', hasFingering: true, fingering: '080_G#5_Ab5_v1.jpg', variants: 1 },
            'B5': { positionId: 28, displayName: 'B5', hasFingering: true, fingering: '083_B5_v1.jpg', variants: 1 },
            'B#5': { positionId: 28, displayName: 'B#5', hasFingering: false, fingering: null, variants: 1 },
            'Bb5': { positionId: 28, displayName: 'Bb5', hasFingering: true, fingering: '082_A#5_Bb5_v1.jpg', variants: 4 },
            'C6': { positionId: 29, displayName: 'C6', hasFingering: true, fingering: '084_C6_v1.jpg', variants: 2 },
            'C#6': { positionId: 29, displayName: 'C#6', hasFingering: true, fingering: '085_C#6_Db6_v1.jpg', variants: 1 },
            'Cb6': { positionId: 29, displayName: 'Cb6', hasFingering: false, fingering: null, variants: 1 },
            'D6': { positionId: 30, displayName: 'D6', hasFingering: true, fingering: '086_D6_v1.jpg', variants: 1 },
            'D#6': { positionId: 30, displayName: 'D#6', hasFingering: true, fingering: '087_D#6_Eb6_v1.jpg', variants: 1 },
            'Db6': { positionId: 30, displayName: 'Db6', hasFingering: false, fingering: null, variants: 1 },
            'E6': { positionId: 31, displayName: 'E6', hasFingering: true, fingering: '088_E6_v1.jpg', variants: 2 },
            'E#6': { positionId: 31, displayName: 'E#6', hasFingering: false, fingering: null, variants: 1 },
            'Eb6': { positionId: 31, displayName: 'Eb6', hasFingering: true, fingering: '087_D#6_Eb6_v1.jpg', variants: 1 },
            'F6': { positionId: 32, displayName: 'F6', hasFingering: true, fingering: '089_F6_v1.jpg', variants: 2 },
            'F#6': { positionId: 32, displayName: 'F#6', hasFingering: true, fingering: '090_F#6_Gb6_v1.jpg', variants: 1 },
            'Fb6': { positionId: 32, displayName: 'Fb6', hasFingering: false, fingering: null, variants: 1 }
        });
        
        return noteMap[noteName] || { positionId: 1, displayName: noteName, hasFingering: false, fingering: null, variants: 1 };
    }
    
    // === Тактовые черты, размер такта и реприза ===
    
    // Длительность элемента в четвертях
    elementBeats(element) {
        return Playback.beatsFor(element.duration, element.dotted);
    }
    
    // Длина такта в четвертях: 4/4 -> 4, 6/8 -> 3
    measureBeats() {
        const parts = String(this.timeSignature || DEFAULT_TIME_SIGNATURE).split('/');
        const numerator = parseInt(parts[0], 10) || 4;
        const denominator = parseInt(parts[1], 10) || 4;
        return numerator * (4 / denominator);
    }
    
    // Какие элементы закрываются тактовой чертой. В автоматическом режиме черта
    // встаёт после элемента, на котором сумма длительностей доходит до границы
    // такта или переходит её. Знак конца репризы сам является тактовой чертой.
    computeBarLines() {
        const marks = new Map(); // id элемента -> 'barline' | 'repeat-end'
        const measure = this.measureBeats();
        let total = 0;
        
        if (this.barLineMode === 'auto') {
            let nextBoundary = measure;
            
            this.notes.forEach(element => {
                const start = total;
                total += this.elementBeats(element);
                
                // Граница такта попала внутрь длительности ноты
                element.crossesBoundary = Math.floor((total - 1e-6) / measure) >
                    Math.floor((start + 1e-6) / measure);
                
                if (total >= nextBoundary - 1e-6) {
                    marks.set(element.id, 'barline');
                    while (nextBoundary <= total + 1e-6) {
                        nextBoundary += measure;
                    }
                }
            });
            
            const complete = Math.floor((total + 1e-6) / measure);
            const tailStart = complete * measure;
            const hasTail = total - tailStart > 1e-6;

            // Пустой такт в конце не считаем: если последняя нота просто
            // тянется через границу, нот в последнем такте нет
            let tailHasNote = false;
            if (hasTail) {
                let start = 0;
                this.notes.forEach(element => {
                    if (start >= tailStart - 1e-6) tailHasNote = true;
                    start += this.elementBeats(element);
                });
            }

            this.measureCount = total > 0 ? complete + (hasTail && tailHasNote ? 1 : 0) : 0;
        } else {
            this.notes.forEach(element => {
                element.crossesBoundary = false;
                if (element.hasBarLine) marks.set(element.id, 'barline');
            });
            this.measureCount = this.notes.length ? marks.size + 1 : 0;
        }
        
        this.notes.forEach(element => {
            if (element.repeatEnd) {
                marks.set(element.id, 'repeat-end');
            }
        });
        
        return marks;
    }
    
    clearNotationMarks() {
        this.notationMarks.forEach(node => node.remove());
        this.notationMarks = [];
    }
    
    // Перерисовка черт и знаков репризы. Всё вычисляется из состояния заново,
    // поэтому любое изменение даёт согласованную картинку.
    renderNotationMarks() {
        this.clearNotationMarks();
        
        const marks = this.computeBarLines();
        const slot = this.imageSize + 2;
        const height = STAFF_MAIN_BOTTOM - STAFF_MAIN_TOP;
        
        // Точки, занятые знаками репризы: знак сам содержит тактовую черту
        const repeatStarts = new Set();
        const repeatEnds = new Set();
        this.notes.forEach(element => {
            if (element.repeatStart) repeatStarts.add(Math.round(element.x - slot / 2));
            if (element.repeatEnd) repeatEnds.add(Math.round(element.x + slot / 2));
        });
        
        this.notes.forEach(element => {
            element.element.classList.toggle('crosses-boundary', !!element.crossesBoundary);
            
            // Поясняем оранжевую подсветку: нота звучит через границу такта
            if (element.crossesBoundary) {
                element.element.setAttribute('title', t('note.crossesBoundary'));
            } else {
                element.element.removeAttribute('title');
            }
            
            const mark = marks.get(element.id);
            const rightEdge = element.x + slot / 2;
            
            if (mark === 'repeat-end') {
                this.notationMarks.push(this.createRepeatSign(element, 'end', rightEdge, height));
            } else if (mark === 'barline' && !repeatStarts.has(Math.round(rightEdge))) {
                this.notationMarks.push(this.createBarLine(element, rightEdge));
            }
            
            if (element.repeatStart) {
                const leftEdge = element.x - slot / 2;
                // Если здесь же заканчивается другая реприза, отодвигаем знак вправо
                const x = repeatEnds.has(Math.round(leftEdge)) ? leftEdge + 15 : leftEdge;
                this.notationMarks.push(this.createRepeatSign(element, 'start', x, height));
            }
        });
        
        this.renderMeasureNumbers(marks);
        this.updateMeasureInfo();
    }
    
    // Номера тактов: маленькая серая цифра над верхней линейкой в начале такта.
    // Номер сквозной по всей мелодии, как в нотах.
    // Номера тактов: маленькая серая цифра над верхней толстой линейкой в начале
    // такта. Считаем по долям, а не по нотам: граница такта может попасть внутрь
    // длинной ноты, и тогда ноты в начале такта просто нет.
    renderMeasureNumbers(marks) {
        const slot = this.imageSize + 2;
        const measure = this.measureBeats();
        let beat = 0;
        let nextNumber = 0;
        let number = 0;

        this.notes.forEach(element => {
            const beats = this.elementBeats(element);
            const start = beat;
            const end = beat + beats;
            const staff = this.staffContainers[element.system];

            while (nextNumber <= end - 1e-6 && staff) {
                if (nextNumber >= start - 1e-6) {
                    // Номер ставим только в начале такта, где начинается нота.
                    // Над нотой, которая тянется через границу, номера не пишем
                    const atStart = Math.abs(nextNumber - start) < 1e-6;
                    const barNumber = ++number;

                    if (!atStart) {
                        nextNumber += measure;
                        continue;
                    }

                    const label = document.createElement('span');
                    label.className = 'measure-number fade-in';
                    label.textContent = barNumber;
                    label.style.left = Math.round(element.x - slot / 2) + 'px';
                    label.style.top = (STAFF_MAIN_TOP - 14) + 'px';

                    staff.appendChild(label);
                    this.notationMarks.push(label);
                }

                nextNumber += measure;
            }

            beat = end;
        });
    }

    createBarLine(element, x) {
        const barLine = document.createElement('div');
        barLine.className = 'bar-line fade-in';
        barLine.style.left = x + 'px';
        barLine.style.top = STAFF_MAIN_TOP + 'px';
        barLine.style.height = (STAFF_MAIN_BOTTOM - STAFF_MAIN_TOP) + 'px';
        barLine.title = t('barline.title', { target: this.elementLabel(element) });
        
        barLine.addEventListener('click', (e) => {
            e.stopPropagation();
            this.selectNote(element.id);
        });
        
        this.systemContainer(element).appendChild(barLine);
        return barLine;
    }
    
    // Стан той строки, в которой стоит элемент
    systemContainer(element) {
        const index = element.system || 0;
        return this.staffContainers[index] || this.staffContainers[0] || this.container;
    }
    
    // side: 'start' - знак |:, 'end' - знак :|
    createRepeatSign(element, side, x, height) {
        const sign = document.createElement('div');
        sign.className = 'repeat-sign ' + side + ' fade-in';
        sign.style.left = x + 'px';
        sign.style.top = STAFF_MAIN_TOP + 'px';
        sign.style.height = height + 'px';
        sign.innerHTML = '<span class="repeat-bar thick"></span>' +
            '<span class="repeat-bar thin"></span>' +
            '<span class="repeat-dot upper"></span>' +
            '<span class="repeat-dot lower"></span>';
        sign.title = t(side === 'start' ? 'barline.repeatStartTitle' : 'barline.repeatEndTitle',
            { target: this.elementLabel(element) });
        
        sign.addEventListener('click', (e) => {
            e.stopPropagation();
            if (side === 'start') {
                element.repeatStart = false;
            } else {
                element.repeatEnd = false;
            }
            this.relayout();
            this.updateBarLineButtons();
            this.scheduleAutosave();
            this.updateStatus(t(side === 'start' ? 'status.repeatStartOff' : 'status.repeatEndOff'));
        });
        
        this.systemContainer(element).appendChild(sign);
        return sign;
    }
    
    elementLabel(element) {
        return element.isRest ? t('target.rest') : t('target.note', { name: element.displayName });
    }
    
    updateMeasureInfo() {
        const node = document.getElementById('measure-info');
        if (!node) return;
        
        node.textContent = this.notes.length
            ? t('staff.measures', { signature: this.timeSignature, n: this.measureCount })
            : t('staff.metre', { signature: this.timeSignature });
    }
    
    setTimeSignature(value) {
        this.timeSignature = value || DEFAULT_TIME_SIGNATURE;
        
        const select = document.getElementById('time-signature');
        if (select && select.value !== this.timeSignature) select.value = this.timeSignature;
        
        this.relayout();
        this.scheduleAutosave();
        
        if (this.notes.length) {
            this.updateStatus(t('status.signatureSet', { signature: this.timeSignature, n: this.measureCount }));
        }
    }
    
    setBarLineMode(mode) {
        if (mode !== 'auto' && mode !== 'manual') return;
        this.barLineMode = mode;
        
        const radio = document.querySelector(`input[name="barline-mode"][value="${mode}"]`);
        if (radio) radio.checked = true;
        
        this.relayout();
        this.updateBarLineButtons();
        this.scheduleAutosave();
        this.updateStatus(t(mode === 'auto' ? 'status.barlinesAuto' : 'status.barlinesManual'));
    }
    
    // Добавление тактовой черты после выделенного элемента (ручной режим)
    addBarLine() {
        if (this.barLineMode !== 'manual') {
            this.updateStatus(t('status.manualOnly'));
            return null;
        }
        
        const note = this.notes.find(n => n.id === this.selectedNoteId);
        if (!note) {
            this.updateStatus(t('status.selectForBarline'));
            return null;
        }
        
        note.hasBarLine = true;
        this.relayout();
        this.updateBarLineButtons();
        this.updateStatus(t('status.barlineAdded', { target: this.elementLabel(note) }));
        this.scheduleAutosave();
        return note.id;
    }
    
    // Удаление тактовой черты у выделенного элемента (ручной режим)
    removeBarLine() {
        if (this.barLineMode !== 'manual') {
            this.updateStatus(t('status.manualOnly'));
            return false;
        }
        
        const note = this.notes.find(n => n.id === this.selectedNoteId);
        if (!note) return false;
        
        if (!note.hasBarLine) {
            this.updateStatus(t('status.barlineMissing', { target: this.elementLabel(note) }));
            return false;
        }
        
        note.hasBarLine = false;
        this.relayout();
        this.updateBarLineButtons();
        this.updateStatus(t('status.barlineRemoved', { target: this.elementLabel(note) }));
        this.scheduleAutosave();
        return true;
    }
    
    clearAllBarLines() {
        this.notes.forEach(note => { note.hasBarLine = false; });
        this.relayout();
        this.updateBarLineButtons();
        this.updateStatus(t('status.barlinesCleared'));
    }
    
    // Начало репризы у выделенного элемента
    toggleRepeatStart() {
        const note = this.notes.find(n => n.id === this.selectedNoteId);
        if (!note) {
            this.updateStatus(t('status.selectForRepeatStart'));
            return false;
        }
        
        note.repeatStart = !note.repeatStart;
        this.relayout();
        this.updateBarLineButtons();
        this.scheduleAutosave();
        this.updateStatus(t(note.repeatStart ? 'status.repeatStartOn' : 'status.repeatStartOff'));
        return note.repeatStart;
    }
    
    // Конец репризы у выделенного элемента
    toggleRepeatEnd() {
        const note = this.notes.find(n => n.id === this.selectedNoteId);
        if (!note) {
            this.updateStatus(t('status.selectForRepeatEnd'));
            return false;
        }
        
        note.repeatEnd = !note.repeatEnd;
        this.relayout();
        this.updateBarLineButtons();
        this.scheduleAutosave();
        this.updateStatus(t(note.repeatEnd ? 'status.repeatEndOn' : 'status.repeatEndOff'));
        return note.repeatEnd;
    }
    
    // Состояние кнопок тактовых черт и репризы
    updateBarLineButtons() {
        const note = this.notes.find(n => n.id === this.selectedNoteId);
        const manual = this.barLineMode === 'manual';
        
        const addButton = document.getElementById('btn-add-barline');
        const removeButton = document.getElementById('btn-remove-barline');
        const startButton = document.getElementById('btn-repeat-start');
        const endButton = document.getElementById('btn-repeat-end');
        
        if (addButton) addButton.disabled = !manual || !note;
        if (removeButton) removeButton.disabled = !manual || !note || !note.hasBarLine;
        
        if (startButton) {
            startButton.disabled = !note;
            startButton.classList.toggle('active', !!note && !!note.repeatStart);
        }
        if (endButton) {
            endButton.disabled = !note;
            endButton.classList.toggle('active', !!note && !!note.repeatEnd);
        }
    }
    
    updateStatus(message) {
        document.getElementById('status-message').textContent = message;
        console.log('Status:', message);
    }
    
    // Прокручивает область стана к строке, которая звучит, плавным движением.
    // Если это последняя нота строки, заранее показываем следующую:
    // переключение происходит, пока нота ещё звучит.
    // Вспышка на строке, к которой перешла игра. Плавная прокрутка на планшете
    // может отстать, и тогда непонятно, сменилась строка или нет. Анимируется
    // только прозрачность, поэтому кадры на вспышку не тратятся.
    flashSystem(system, area) {
        const staff = system ? system.querySelector('.staff') : null;
        if (!staff || !area) return;

        let flash = this.lineFlash;
        if (!flash) {
            flash = document.createElement('div');
            flash.className = 'line-flash';
            this.lineFlash = flash;
        }

        const staffRect = staff.getBoundingClientRect();
        const areaRect = area.getBoundingClientRect();
        flash.style.top = Math.round(staffRect.top - areaRect.top + area.scrollTop) + 'px';
        flash.style.height = Math.round(staffRect.height) + 'px';

        if (flash.parentElement !== area) area.appendChild(flash);

        flash.classList.remove('on');
        void flash.offsetWidth; // перезапуск перехода
        flash.classList.add('on');

        clearTimeout(this.flashTimer);
        this.flashTimer = setTimeout(() => flash.classList.remove('on'), 60);
    }
    followPlayback(element, options = {}) {
        if (!element) return;
        
        const area = document.querySelector('.scrollable-area');
        if (!area) return;
        
        let systemIndex = element.system || 0;
        if (element.lastInSystem && this.staffContainers[systemIndex + 1]) {
            systemIndex += 1;
        }
        
        // Читаем координаты только при смене строки: иначе на каждую ноту
        // идёт принудительный пересчёт вёрстки, и подсветка подтормаживает
        // Один раз на строку: повторные чтения координат тормозят подсветку.
        // Но если область прокрутили вручную, следим заново
        const scrolledByHand = area.scrollTop !== this.followedScrollTop;
        if (!options.instant && this.followedSystem === systemIndex && !scrolledByHand) return;
        this.followedScrollTop = area.scrollTop;

        const staff = this.staffContainers[systemIndex];
        // Именно строка целиком: в неё входят и стан, и ряд аппликатур.
        // Если взять обёртку стана, аппликатуры остаются за краем области.
        const system = staff ? staff.closest('.system') : null;

        // Картинки следующей строки декодируем заранее: иначе первый кадр
        // после перехода тратится на их декодирование, и подсветка замирает
        const nextStaff = this.staffContainers[systemIndex + 1];
        const nextSystem = nextStaff ? nextStaff.closest('.system') : null;
        if (nextSystem) {
            nextSystem.querySelectorAll('img').forEach(img => {
                if (img.decode) img.decode().catch(() => {});
            });
        }
        if (!system) return;
        
        const areaRect = area.getBoundingClientRect();
        const systemRect = system.getBoundingClientRect();
        const top = systemRect.top - areaRect.top + area.scrollTop;
        const bottom = top + systemRect.height;
        const viewTop = area.scrollTop;
        const viewBottom = viewTop + area.clientHeight;
        
        // Строка уже видна целиком - не дёргаем область
        if (top >= viewTop && bottom <= viewBottom) return;
        
        const limit = Math.max(0, area.scrollHeight - area.clientHeight);
        const target = Math.max(0, Math.min(top - PLAYBACK_SCROLL_MARGIN, limit));
        
        if (!options.instant) this.flashSystem(system, area);

        this.scrollAreaTo(area, target, !!options.instant);
    }
    
    // Плавная прокрутка области. При отключённой анимации в системе - сразу.
    scrollAreaTo(area, top, instant) {
        const reduce = window.matchMedia &&
            window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        
        // Мгновенный переход нужен перед запуском: плавный не успеет к первой ноте
        if (instant || reduce || typeof area.scrollTo !== 'function') {
            area.scrollTop = top;
            return;
        }
        
        area.scrollTo({ top: top, behavior: 'smooth' });
    }
    
    // Подсветка элемента, который звучит сейчас: знак на стане и карточка аппликатуры
    // Узлы подсветки готовим заранее: в кадре не должно быть поиска по документу,
    // иначе подсветка отстаёт от звука на время этого поиска
    prepareHighlightNodes(sequence) {
        this.highlightNodes = new Map();

        (sequence || []).forEach(element => {
            if (!element || !element.id) return;
            this.highlightNodes.set(element.id, {
                anchor: element.element,
                card: document.querySelector('.fingering-card[data-note-id="' + element.id + '"]')
            });
        });
    }
    // Подсветка звучащего элемента. Снимаем класс только с прошлого: обход
    // всего стана на каждую ноту заметно тормозил подсветку
    highlightElement(element) {        const previousNote = this.playingNote;
        const previousCard = this.playingCard;

        if (previousNote && previousNote.element) previousNote.element.classList.remove('playing');
        if (previousCard) previousCard.classList.remove('playing');

        this.playingNote = null;
        this.playingCard = null;
        
        if (!element) return;
        
        if (element.element) {
            element.element.classList.add('playing');
            this.playingNote = element;
        }
        
        const prepared = this.highlightNodes && this.highlightNodes.get(element.id);
        const card = prepared ? prepared.card : document.querySelector('.fingering-card[data-note-id="' + element.id + '"]');
        if (card) {
            card.classList.add('playing');
            this.playingCard = card;
        }
    }
    
    // Переключение диезов и бемолей переписывает уже добавленные ноты
    setDisplayMode(mode) {
        if (mode !== 'sharps' && mode !== 'flats') return;
        if (this.displayMode === mode) return;
        
        this.displayMode = mode;
        
        this.notes.forEach(element => {
            if (element.isRest) return;
            
            const converted = this.convertNoteName(element.noteName, mode);
            if (!converted) return;
            
            const info = this.getNoteInfoByName(converted);
            const position = this.positions.find(p => p.id === info.positionId);
            if (!position) return;
            
            element.noteName = converted;
            element.displayName = info.displayName;
            element.accidental = this.accidentalOf(info.displayName);
            element.positionId = info.positionId;
            element.y = position.y;
            element.stemUp = position.y > STAFF_MIDDLE_LINE_Y;
            element.fingering = info.fingering;
            element.fingeringBase = info.fingering ? info.fingering.replace(/_v\d+\.jpg$/, '') : null;
            element.hasFingering = info.hasFingering;
            element.variants = info.variants || 1;
            element.currentVariant = Math.min(element.currentVariant || 1, element.variants);
            if (element.fingeringBase) {
                element.fingering = `${element.fingeringBase}_v${element.currentVariant}.jpg`;
            }
            
            element.element.style.top = position.y + 'px';
            element.element.setAttribute('data-stem', element.stemUp ? 'up' : 'down');
            const label = element.element.querySelector('.note-label');
            if (label) label.textContent = this.displayNoteName(info.displayName);
            this.refreshElement(element);
        });
        
        const selected = this.notes.find(n => n.id === this.selectedNoteId);
        if (selected) {
            document.getElementById('selected-note').textContent = selected.isRest ? t('rest.word') : selected.displayName;
            this.updateFingering(selected);
        }
        
        this.scheduleAutosave();
        this.updateStatus(t(mode === 'sharps' ? 'status.sharps' : 'status.flats'));
    }
    
    // Энгармоническая замена: C#4 <-> Db4 и так далее
    convertNoteName(noteName, mode) {
        const replacements = {
            sharps: { 'Db': 'C#', 'Eb': 'D#', 'Gb': 'F#', 'Ab': 'G#', 'Bb': 'A#' },
            flats: { 'C#': 'Db', 'D#': 'Eb', 'F#': 'Gb', 'G#': 'Ab', 'A#': 'Bb' }
        }[mode];
        
        if (!replacements || !noteName) return noteName;
        
        const prefix = noteName.slice(0, 2);
        return replacements[prefix] ? replacements[prefix] + noteName.slice(2) : noteName;
    }
    
    // Единый формат сохранения для файла и LocalStorage
    serializeMelody() {
        return {
            elements: this.notes.map(note => ({
                isRest: !!note.isRest,
                positionId: note.positionId,
                noteName: note.noteName,
                displayName: note.displayName,
                duration: note.duration,
                dotted: Playback.dotCount(note.dotted),
                currentVariant: note.currentVariant || 1,
                hasBarLine: !!note.hasBarLine,
                repeatStart: !!note.repeatStart,
                repeatEnd: !!note.repeatEnd
            })),
            settings: {
                imageSize: this.imageSize,
                showNoteNames: this.showNoteNames,
                showFingerings: this.showFingerings,
                loopPlayback: this.loopPlayback,
                metronome: this.metronome,
                metronomeVolume: this.metronomeVolume,
                appSoundShift: this.appSoundShift,
                saxShift: this.saxShift,
                soundingNames: this.soundingNames,
                countIn: this.countIn,
                displayMode: this.displayMode,
                tempo: this.tempo,
                timeSignature: this.timeSignature,
                barLineMode: this.barLineMode
            },
            timestamp: new Date().toISOString(),
            version: '1.5.0',
            range: 'C2 - F#6'
        };
    }
    
    // Автосохранение после каждого изменения: раньше оно висело только на закрытии
    // вкладки и терялось, если вкладку закрывали не штатно.
    scheduleAutosave() {
        if (this.loading) return;
        clearTimeout(this.autosaveTimer);
        this.autosaveTimer = setTimeout(() => this.saveToLocalStorage(true), 400);
    }
    
    saveToLocalStorage(silent = false) {
        try {
            localStorage.setItem('saxophone-fullrange-data', JSON.stringify(this.serializeMelody()));
            if (!silent) this.updateStatus(t('status.savedLocal'));
            return true;
        } catch (error) {
            this.updateStatus(t('status.saveError', { message: error.message }));
            return false;
        }
    }
    
    // Восстановление мелодии из сохранённых данных. Понимает и новый формат (elements),
    // и старый (notes) - чтобы ранее сохранённые мелодии не потерялись.
    applyMelody(data) {
        // Загрузка из файла заменяет мелодию целиком - это как открытие
        // документа. История отката начинается заново: иначе первый же откат
        // вернул бы прежнюю мелодию, а выглядит это как пропажа всех нот.
        if (!this.restoring) {
            this.history.length = 0;
            this.redoHistory.length = 0;
            this.updateHistoryButtons();
        }
        
        const elements = (data && (data.elements || data.notes)) || [];
        
        this.loading = true;
        this.clearAllNotes();
        
        elements.forEach(item => {
            const elementId = item.isRest
                ? this.addRest(null, { silent: true })
                : this.addNote(item.positionId, item.noteName, null, { silent: true });
            if (!elementId) return;
            
            const element = this.notes.find(n => n.id === elementId);
            if (!element) return;
            
            element.duration = item.duration || 4;
            element.dotted = Playback.dotCount(item.dotted);
            
            // Возвращаем выбранный вариант аппликатуры
            if (!element.isRest && element.hasFingering && item.currentVariant > 1) {
                element.currentVariant = Math.min(item.currentVariant, element.variants);
                if (element.fingeringBase) {
                    element.fingering = `${element.fingeringBase}_v${element.currentVariant}.jpg`;
                }
            }
            this.refreshElement(element);
            
            element.hasBarLine = !!item.hasBarLine;
            element.repeatStart = !!item.repeatStart;
            element.repeatEnd = !!item.repeatEnd;
        });
        
        this.applySettings(data && data.settings);
        
        this.loading = false;
        this.deselectNote();
        this.relayout();
    }
    
    // Загрузка мелодии из MIDI-файла: разбор, преобразование и перенос на стан.
    // Возвращает сведения о переносе, чтобы их можно было проверить.
    applyMidiBuffer(buffer) {
        const parsed = Midi.parse(buffer);
        
        if (!parsed.ok) {
            const reason = (parsed.errors && parsed.errors.length)
                ? parsed.errors[0]
                : t('midi.badFile');
            this.updateStatus(t('midi.failed', { reason: reason }));
            return null;
        }
        
        const converted = Midi.toElements(parsed);
        
        if (!converted.elements.length) {
            this.updateStatus(t('midi.empty'));
            return null;
        }
        
        this.applyMelody({
            elements: converted.elements,
            settings: {
                imageSize: this.imageSize,
                showNoteNames: this.showNoteNames,
                showFingerings: this.showFingerings,
                loopPlayback: this.loopPlayback,
                metronome: this.metronome,
                metronomeVolume: this.metronomeVolume,
                appSoundShift: this.appSoundShift,
                saxShift: this.saxShift,
                soundingNames: this.soundingNames,
                countIn: this.countIn,
                displayMode: this.displayMode
            }
        });
        
        this.applyMidiSettings(converted);
        this.updateStatus(this.midiStatusText(converted));
        
        return converted;
    }
    
    // Темп и размер такта из файла переносим, если приложение их поддерживает
    applyMidiSettings(converted) {
        if (converted.tempoBpm) {
            this.setTempo(Math.max(30, Math.min(240, converted.tempoBpm)));
        }
        
        const signature = converted.timeSignature;
        if (!signature) return;
        
        const text = signature.numerator + '/' + signature.denominator;
        const select = document.getElementById('time-signature');
        const known = select && Array.prototype.some.call(select.options, option => option.value === text);
        
        if (known) this.setTimeSignature(text);
    }
    
    // Что сказать о загруженном файле: сколько нот, одноголосый ли он,
    // не пришлось ли переносить и не потерялось ли что-то
    midiStatusText(converted) {
        const stats = converted.stats;
        const poly = stats.polyphony;
        
        let text = t('midi.loaded', { notes: stats.notes, rests: stats.rests });
        
        text += poly.isMonophonic
            ? t('midi.monophonic')
            : t('midi.polyphonic', { max: poly.maxSimultaneous });
        
        if (converted.shift) text += t('midi.shifted', { semitones: converted.shift });
        if (stats.skipped) text += t('midi.skipped', { n: stats.skipped });
        
        return text;
    }
    
    // Чтение выбранного MIDI-файла
    // Чтение MIDI-файла. Возвращает обещание: по нему удобно дождаться
    // разбора, не подбирая задержку - разбор асинхронный.
    readMidiFile(file) {
        if (!file) return Promise.resolve(false);

        if (typeof FileReader === 'undefined') {
            this.updateStatus(t('midi.failed', { reason: t('midi.badFile') }));
            return Promise.resolve(false);
        }

        return new Promise(resolve => {
            const reader = new FileReader();

            reader.onload = () => {
                try {
                    resolve(this.applyMidiBuffer(reader.result));
                } catch (error) {
                    this.updateStatus(t('midi.failed', { reason: error.message }));
                    resolve(false);
                }
            };

            reader.onerror = () => {
                this.updateStatus(t('midi.failed', { reason: t('midi.badFile') }));
                resolve(false);
            };

            reader.readAsArrayBuffer(file);
        });
    }
    
    applySettings(settings) {
        if (settings && settings.appSoundShift !== undefined) {
            this.appSoundShift = this.clampShift(settings.appSoundShift);
        }

        // Файлы прежних версий хранили один сдвиг: читаем его как оба
        if (settings && settings.appSoundShift === undefined && settings.instrumentTranspose !== undefined) {
            this.appSoundShift = this.clampShift(settings.instrumentTranspose);
            this.saxShift = this.appSoundShift;
        }

        if (settings && settings.saxShift !== undefined) {
            this.saxShift = this.clampShift(settings.saxShift);
        }

        if (settings && settings.soundingNames !== undefined) {
            this.soundingNames = !!settings.soundingNames;
        }

        // Файлы прежних версий хранили обратный флаг: читаем его наоборот
        if (settings && settings.soundingNames === undefined && settings.fingeringLinked !== undefined) {
            this.soundingNames = !settings.fingeringLinked;
        }
        if (!settings) return;
        
        if (settings.imageSize) {
            this.updateImageSize(settings.imageSize);
            const slider = document.getElementById('image-size-slider');
            if (slider) slider.value = settings.imageSize;
        }
        
        if (settings.showNoteNames !== undefined) {
            this.updateNoteNamesVisibility(settings.showNoteNames);
            const checkbox = document.getElementById('show-note-names');
            if (checkbox) checkbox.checked = settings.showNoteNames;
        }
        
        if (settings.showFingerings !== undefined) {
            this.setFingeringsVisible(settings.showFingerings, true);
        }
        
        if (settings.loopPlayback !== undefined) {
            this.setLoopPlayback(settings.loopPlayback, true);
        }
        
        if (settings.displayMode) {
            this.displayMode = settings.displayMode;
            const radio = document.querySelector(`input[name="accidentals-mode"][value="${settings.displayMode}"]`);
            if (radio) radio.checked = true;
        }
        
        if (settings.tempo) {
            this.setTempo(settings.tempo);
        }
        
        if (settings.timeSignature) {
            this.setTimeSignature(settings.timeSignature);
        }
        
        if (settings.barLineMode) {
            this.setBarLineMode(settings.barLineMode);
        }
    }
    
    // Сдвиг инструмента: ноты и аппликатуры остаются на месте, меняется только
    // высота звука. 0 - нота звучит как записана, -12 - на октаву ниже
    // Аппликатура записанной ноты с учётом сдвига инструмента. Нота на стане
    // остаётся, но на инструменте со сдвигом её берут другим набором клавиш:
    // аппликатуру показываем для ноты, которая на этом инструменте звучит
    // так же, то есть для ноты, сдвинутой в обратную сторону
    // Сдвиг звука в полутонах. Отсчёт ведётся от значения по умолчанию (-12):
    // при нём нота звучит ровно так, как подписана, и смена значения сдвигает
    // звук относительно этой точки, а не от нуля
    soundSemitones() {
        // Звук приложения: сколько стоит в настройке, столько и сдвиг.
        // Ноль означает, что нота звучит ровно как записана, как у пианино
        return Number(this.appSoundShift) || 0;
    }
    fingeringFor(noteName) {
        const written = this.getNoteInfoByName(noteName);
        // Аппликатура всегда та, которой этот звук берётся на инструменте:
        // сдвиг приложения минус сдвиг инструмента. Флажок подписей на неё
        // не влияет - он отвечает только за названия нот
        const shift = (Number(this.appSoundShift) || 0) - (Number(this.saxShift) || 0);

        if (!shift || !written) return written;

        const shiftedName = Playback.transposeNoteName(noteName, shift);
        const shifted = shiftedName === noteName ? written : this.getNoteInfoByName(shiftedName);

        // Если у сдвинутой ноты аппликатуры нет, показываем честно, что её
        // нет: подставлять картинку другой ноты нельзя, это путает
        return shifted || written;
    }

    // Пересчитать аппликатуры всех нот: вызывается при смене сдвига инструмента
    // Аппликатуры по текущим настройкам: только поля нот, без перерисовки
    recomputeFingerings() {
        this.notes.forEach(note => {
            if (note.isRest) return;

            const info = this.fingeringFor(note.noteName);
            if (!info) return;

            // Имя файла собираем с учётом выбранного варианта: иначе при
            // пересчёте терялся вариант, выбранный пользователем
            const base = info.fingering ? info.fingering.replace(/_v\d+\.jpg$/, '') : null;
            const variants = info.variants || 1;
            const variant = Math.min(note.currentVariant || 1, variants);

            note.fingeringBase = base;
            note.fingering = base ? (base + '_v' + variant + '.jpg') : null;
            note.hasFingering = info.hasFingering;
            note.variants = variants;

            // Выбранный вариант аппликатуры не сбрасываем: при смене сдвига
            // количество вариантов может измениться, но выбор пользователя важнее
        });

    }

    // Пересчитать и сразу перерисовать карточки
    refreshInstrumentFingerings() {
        this.recomputeFingerings();
        this.updateAllFingerings();
    }
    // Сдвиг звука приложения: насколько звук отличается от нот на стане
    // Сдвиг подписей нот. Связь выключена - нотоносец связан со звуком,
    // поэтому имена показываем в звучащей октаве. Связь включена - показываем
    // стандартные саксофонные имена, как их читает саксофонист
    displayShift() {
        // Написанная подпись - само имя ноты, без всяких сдвигов: как в файле.
        // Звучащая идёт за звуком приложения, чтобы подпись совпадала со слухом
        return this.soundingNames ? this.soundSemitones() : 0;
    }

    displayNoteName(noteName) {
        const shift = this.displayShift();
        if (!shift) return noteName;

        return Playback.transposeNoteName(noteName, shift);
    }

    // Подписи нот перерисовываем при смене сдвигов
    refreshNoteLabels() {
        this.notes.forEach(element => {
            if (element.isRest || !element.element) return;

            const label = element.element.querySelector('.note-label');
            if (label) label.textContent = this.displayNoteName(element.noteName);
        });
    }

    setAppSoundShift(value) {
        this.appSoundShift = this.clampShift(value);
        this.afterShiftChange();

        return this.appSoundShift;
    }

    // Сдвиг звука инструмента: насколько саксофон звучит выше или ниже аппликатуры
    setSaxSoundShift(value) {
        this.saxShift = this.clampShift(value);
        this.afterShiftChange();

        return this.saxShift;
    }

    // Связь аппликатуры со станом
    setSoundingNames(value) {
        this.soundingNames = !!value;
        this.afterShiftChange();

        return this.soundingNames;
    }

    clampShift(value) {
        let semitones = Math.round(Number(value));
        if (!Number.isFinite(semitones)) semitones = 0;

        return Math.max(-24, Math.min(24, semitones));
    }

    // Общее после смены любой настройки: звук, аппликатуры, пресеты и пример
    afterShiftChange() {
        // Если звук изменился во время игры, остаток мелодии перепланируем:
        // короткая заминка здесь - осознанный выбор в пользу верного звука
        const needsReplan = !!this.melodyPlayer && this.melodyPlayer.playing &&
            this.melodyPlayer.transpose !== this.soundSemitones();

        // Плееру всегда отдаём сдвиг от точки отсчёта, а не сырое значение
        if (this.melodyPlayer) this.melodyPlayer.setTranspose(this.soundSemitones());

        this.refreshInstrumentFingerings();
        this.refreshNoteLabels();
        this.syncFineControls();
        this.syncPresetHighlight();
        this.updateInstrumentExample();

        this.updateStatus(t('status.shifts', {
            app: this.appSoundShift,
            sax: this.saxShift
        }));

        this.scheduleAutosave();

        if (needsReplan) this.melodyPlayer.replan(this.soundSemitones());
    }

    // Поля тонкой настройки и флажок приводятся к текущим значениям
    syncFineControls() {
        const appInput = document.getElementById('app-sound-shift');
        if (appInput && parseInt(appInput.value, 10) !== this.appSoundShift) {
            appInput.value = this.appSoundShift;
        }

        const saxInput = document.getElementById('sax-sound-shift');
        if (saxInput && parseInt(saxInput.value, 10) !== this.saxShift) {
            saxInput.value = this.saxShift;
        }

        const linked = document.getElementById('fingering-linked');
        if (linked) linked.checked = !!this.soundingNames;
    }

    // Подсветка пресета, который совпал с тонкой настройкой
    syncPresetHighlight() {
        document.querySelectorAll('.btn-preset').forEach(button => {
            const same = Number(button.getAttribute('data-app-shift')) === this.appSoundShift &&
                Number(button.getAttribute('data-sax-shift')) === this.saxShift &&
                (button.getAttribute('data-sounding') === '1') === !!this.soundingNames;

            button.classList.toggle('active', same);
        });
    }

    // Пресет просто выставляет значения тонкой настройки
    applyPreset(button) {
        if (!button) return;

        this.appSoundShift = this.clampShift(button.getAttribute('data-app-shift'));
        this.saxShift = this.clampShift(button.getAttribute('data-sax-shift'));
        this.soundingNames = button.getAttribute('data-sounding') === '1';

        this.afterShiftChange();
    }

    // Наглядная строка: что играет приложение и что звучит у саксофона
    updateInstrumentExample() {
        const example = document.getElementById('instrument-example');
        if (!example) return;

        const fingering = this.fingeringFor('C4');
        const appNote = Playback.transposeNoteName('C4', this.appSoundShift);
        const saxNote = Playback.transposeNoteName(
            fingering ? fingering.displayName : 'C4', this.saxShift);

        example.textContent = t('instrument.example', { app: appNote, sax: saxNote });
    }

    // Свёрнутая тонкая настройка: положение запоминаем между запусками
    toggleFineBlock(open) {
        const body = document.getElementById('fine-body');
        const head = document.getElementById('fine-toggle');
        if (!body) return;

        const shouldOpen = (open === undefined) ? body.hidden : !!open;

        body.hidden = !shouldOpen;
        if (head) head.setAttribute('aria-expanded', shouldOpen ? 'true' : 'false');

        try {
            localStorage.setItem('sax-fine-open', shouldOpen ? '1' : '0');
        } catch (error) {
            // Приватный режим: просто не запоминаем
        }
    }

    restoreFineBlock() {
        let stored = null;
        try { stored = localStorage.getItem('sax-fine-open'); } catch (error) { stored = null; }

        this.toggleFineBlock(stored === '1');
    }
    setTempo(value) {
        const parsed = parseInt(value, 10);
        const tempo = Math.min(240, Math.max(30, parsed || 80));
        this.tempo = tempo;
        
        const input = document.getElementById('tempo-input');
        if (input && parseInt(input.value, 10) !== tempo) input.value = tempo;
        
        return tempo;
    }
    
    loadFromLocalStorage() {
        try {
            const dataStr = localStorage.getItem('saxophone-fullrange-data');
            if (!dataStr) {
                this.updateStatus(t('status.noSavedMelody'));
                return false;
            }
            
            const data = JSON.parse(dataStr);
            // Восстановление последней мелодии при запуске - не действие
            // пользователя, поэтому в историю отката его не пишем: иначе
            // первый же откат вернул бы пустой стан и все ноты пропали бы
            this.restoring = true;
            this.applyMelody(data);
            this.restoring = false;
            
            const savedAt = data.timestamp ? new Date(data.timestamp) : null;
            const when = savedAt && !isNaN(savedAt.getTime())
                ? savedAt.toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
                : '';
            
            this.updateStatus(when ? t('status.lastMelody', { when: when }) : t('status.lastMelodyPlain'));
            return true;
        } catch (error) {
            this.updateStatus(t('status.loadError', { message: error.message }));
            return false;
        }
    }
    
    saveToFile() {
        try {
            const data = this.serializeMelody();
            const dataStr = JSON.stringify(data, null, 2);
            const blob = new Blob([dataStr], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            
            const a = document.createElement('a');
            a.href = url;
            a.download = 'saxophone-fullrange-' + new Date().toISOString().slice(0, 10) + '.json';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            
            this.updateStatus(t('status.melodySaved'));
            return true;
        } catch (error) {
            this.updateStatus(t('status.saveError', { message: error.message }));
            return false;
        }
    }
    
    // Раскладка мелодии по времени для выгрузки в MIDI. Репетиции
    // разворачиваются так же, как при проигрывании, а паузы просто
    // сдвигают время: в MIDI пауза - это отсутствие звука.
    midiExportNotes() {
        const sequence = Playback.buildSequence(this.notes);
        const result = [];
        let beat = 0;
        
        sequence.forEach(element => {
            const beats = Playback.beatsFor(element.duration, element.dotted);
            
            if (!element.isRest) {
                const midi = Midi.nameToMidi(element.noteName || element.displayName);
                if (midi !== null) {
                    // В MIDI уходит звучащая высота, а не написанная: иначе
            // гитарная мелодия окажется в файле на октаву выше
            result.push({
                midi: midi + this.soundSemitones(),
                startBeat: beat,
                beats: beats
            });
                }
            }
            
            beat += beats;
        });
        
        return result;
    }
    
    // Сохранение в MIDI: набранное на планшете можно забрать в другую
    // музыкальную программу. Аппликатур в файле нет - MIDI их не хранит,
    // записываются только высота, длительность и темп.
    saveMidiFile() {
        try {
            if (!this.notes.length) {
                this.updateStatus(t('status.exportEmpty'));
                return false;
            }
            
            const notes = this.midiExportNotes();
            if (!notes.length) {
                this.updateStatus(t('status.exportEmpty'));
                return false;
            }
            
            const bytes = Midi.build({
                notes: notes,
                tempo: this.tempo,
                timeSignature: this.timeSignature
            });
            
            const blob = new Blob([new Uint8Array(bytes)], { type: 'audio/midi' });
            const url = URL.createObjectURL(blob);
            
            const a = document.createElement('a');
            a.href = url;
            a.download = 'saxophone-fullrange-' + new Date().toISOString().slice(0, 10) + '.mid';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            
            this.updateStatus(t('status.midiSaved', { count: notes.length }));
            return true;
        } catch (error) {
            this.updateStatus(t('status.saveError', { message: error.message }));
            return false;
        }
    }
    
    loadFromFile(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            
            reader.onload = (e) => {
                try {
                    this.applyMelody(JSON.parse(e.target.result));
                    this.updateStatus(t('status.melodyLoaded'));
                    this.scheduleAutosave();
                    resolve(true);
                } catch (error) {
                    this.updateStatus(t('status.fileLoadError', { message: error.message }));
                    reject(error);
                }
            };
            
            reader.onerror = () => {
                this.updateStatus(t('status.fileReadError'));
                reject(new Error('Ошибка чтения файла'));
            };
            
            reader.readAsText(file);
        });
    }
}

// Инициализация приложения
document.addEventListener('DOMContentLoaded', () => {
    const staffManager = new FullRangeStaffManager('systems');
    window.staffManager = staffManager;
    
    // Кнопки быстрых нот были удалены из HTML
    
    // Управление нотами
    document.getElementById('btn-note-up').addEventListener('click', () => {
        staffManager.changeSelectedNotePitch(1);
    });
    
    document.getElementById('btn-note-down').addEventListener('click', () => {
        staffManager.changeSelectedNotePitch(-1);
    });
    
    document.getElementById('btn-insert-note').addEventListener('click', () => {
        staffManager.insertNoteBefore();
        releaseButtonFocus();
    });
    
    document.getElementById('btn-delete-note').addEventListener('click', () => {
        staffManager.deleteSelectedNote();
    });
    
    document.getElementById('btn-undo').addEventListener('click', () => {
        staffManager.undo();
    });
    
    document.getElementById('btn-redo').addEventListener('click', () => {
        staffManager.redo();
    });
    
    document.getElementById('btn-midi-save').addEventListener('click', () => {
        staffManager.saveMidiFile();
        releaseButtonFocus();
    });
    
    document.getElementById('btn-clear').addEventListener('click', () => {
        if (confirm(t('status.confirmClear'))) {
            staffManager.pushHistory();
            staffManager.clearAllNotes();
        }
    });
    
    document.getElementById('btn-transpose-up').addEventListener('click', () => {
        staffManager.transposeAllNotes(1);
    });
    
    document.getElementById('btn-transpose-down').addEventListener('click', () => {
        staffManager.transposeAllNotes(-1);
    });
    
    // Сдвиг инструмента: поле, кнопки «минус» и «плюс», кнопки типовых саксофонов
    // Тонкая настройка: два сдвига с кнопками и связь аппликатуры со станом
    document.getElementById('app-sound-shift').addEventListener('change', (e) => {
        staffManager.setAppSoundShift(e.target.value);
    });

    document.getElementById('btn-app-shift-minus').addEventListener('click', () => {
        staffManager.setAppSoundShift(staffManager.appSoundShift - 1);
    });

    document.getElementById('btn-app-shift-plus').addEventListener('click', () => {
        staffManager.setAppSoundShift(staffManager.appSoundShift + 1);
    });

    document.getElementById('sax-sound-shift').addEventListener('change', (e) => {
        staffManager.setSaxSoundShift(e.target.value);
    });

    document.getElementById('btn-sax-shift-minus').addEventListener('click', () => {
        staffManager.setSaxSoundShift(staffManager.saxShift - 1);
    });

    document.getElementById('btn-sax-shift-plus').addEventListener('click', () => {
        staffManager.setSaxSoundShift(staffManager.saxShift + 1);
    });

    document.getElementById('fingering-linked').addEventListener('change', (e) => {
        staffManager.setSoundingNames(e.target.checked);
    });

    document.querySelectorAll('.btn-preset').forEach(button => {
        button.addEventListener('click', () => staffManager.applyPreset(button));
    });

    document.getElementById('fine-toggle').addEventListener('click', () => {
        staffManager.toggleFineBlock();
    });

    document.getElementById('fine-toggle').addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            staffManager.toggleFineBlock();
        }
    });

    // Темп меняется кнопками с шагом 5, поле остаётся редактируемым вручную
    document.getElementById('btn-tempo-minus').addEventListener('click', () => {
        staffManager.setTempo(staffManager.tempo - 5);
    });

    document.getElementById('btn-tempo-plus').addEventListener('click', () => {
        staffManager.setTempo(staffManager.tempo + 5);
    });
    // Сдвиги применяем при запуске: плееру, полям, пресетам и примеру
    staffManager.melodyPlayer.setTranspose(staffManager.soundSemitones());
    staffManager.syncFineControls();
    staffManager.syncPresetHighlight();
    staffManager.updateInstrumentExample();
    staffManager.restoreFineBlock();
    // Сохранение/загрузка
    document.getElementById('btn-save').addEventListener('click', () => {
        staffManager.saveToFile();
        releaseButtonFocus();
    });
    
    document.getElementById('btn-load').addEventListener('click', () => {
        document.getElementById('file-input').click();
    });
    
    // После работы с файлами кнопка остаётся в фокусе. Тогда следующее
    // нажатие пробела нажимает её снова: вместо проигрывания открывается
    // выбор файла. Снимаем фокус - дальше пробел снова управляет музыкой.
    function releaseButtonFocus() {
        const active = document.activeElement;
        if (active && active.tagName === 'BUTTON') active.blur();
    }
    
    document.getElementById('file-input').addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            staffManager.loadFromFile(file);
        }
        e.target.value = ''; // Сбрасываем значение
        releaseButtonFocus();
    });
    
    // Загрузка MIDI
    const midiButton = document.getElementById('btn-midi');
    const midiInput = document.getElementById('midi-input');
    
    if (midiButton && midiInput) {
        midiButton.addEventListener('click', () => midiInput.click());
        
        midiInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                staffManager.readMidiFile(file);
            }
            e.target.value = ''; // Чтобы тот же файл можно было выбрать снова
        releaseButtonFocus();
        });
    }
    
    // Настройки
    document.getElementById('image-size-slider').addEventListener('input', (e) => {
        const size = parseInt(e.target.value);
        staffManager.updateImageSize(size);
        staffManager.scheduleAutosave();
    });
    
    document.getElementById('show-note-names').addEventListener('change', (e) => {
        staffManager.updateNoteNamesVisibility(e.target.checked);
        staffManager.scheduleAutosave();
    });
    
    // Режим отображения альтераций: переписываем уже добавленные ноты
    document.querySelectorAll('input[name="accidentals-mode"]').forEach(radio => {
        radio.addEventListener('change', (e) => {
            staffManager.setDisplayMode(e.target.value);
        });
    });
    
    // Паузы
    document.getElementById('btn-add-rest').addEventListener('click', () => {
        // Если нота выделена, пауза встаёт перед ней: так удобнее
        // набирать. Без выделения - в конец мелодии
        staffManager.insertRestBefore();
        });
    
    // Темп и воспроизведение
    document.getElementById('tempo-input').addEventListener('change', (e) => {
        staffManager.setTempo(e.target.value);
        staffManager.scheduleAutosave();
    });
    
    document.getElementById('btn-play').addEventListener('click', playMelody);
    document.getElementById('btn-stop').addEventListener('click', stopMelody);
    
    function setPlayingState(playing) {
        document.getElementById('btn-play').disabled = playing;
        document.getElementById('btn-stop').disabled = !playing;
    }
    
    function playMelody() {
        if (staffManager.notes.length === 0) {
            staffManager.updateStatus(t('status.addNotesFirst'));
            return;
        }
        
        // Порядок воспроизведения учитывает репризу: участок играется дважды
        const fullSequence = Playback.buildSequence(staffManager.notes);
        const repeats = Playback.computeRepeatPairs(staffManager.notes).length;
        const repeatText = repeats ? t('status.playingRepeat', { n: repeats }) : '';
        
        // Если нота выделена, начинаем с неё
        const fromIndex = selectedStartIndex(fullSequence);
        const sequence = fromIndex > 0 ? fullSequence.slice(fromIndex) : fullSequence;
        const fromText = fromIndex > 0 ? t('status.playingFrom') : '';
        
        function start(isRepeat) {
            // Своё озвучивание отдельных нот гасим: иначе оно наложится
            staffManager.stopNotePreview();

            // Экран переводим на строку начала до включения звука: смещение
            // мгновенное, а на отрисовку кадра есть запас leadIn в плеере
            staffManager.followPlayback(sequence[0], { instant: true });
            
            // Узлы подсветки готовим заранее: в кадре не должно быть поиска по документу
            staffManager.prepareHighlightNodes(sequence);
            staffManager.melodyPlayer.setTranspose(staffManager.soundSemitones());

            const started = staffManager.melodyPlayer.play(sequence, staffManager.tempo, {
                onElement: (index, element) => {
                    staffManager.highlightElement(element);
                    staffManager.followPlayback(element);
                },
                onEnd: () => {
                    // По кругу - пауза, за неё стан поднимается на первую строку,
                    // и только потом начинается следующий круг
                    if (staffManager.loopPlayback) {
                        staffManager.highlightElement(null);
                        staffManager.followPlayback(sequence[0]);
                        staffManager.updateStatus(t('status.loopPause'));
                        start(true);
                        return;
                    }
                    staffManager.highlightElement(null);
                    setPlayingState(false);
                    staffManager.updateStatus(t('status.playDone'));
                },
                onUnsupported: () => {
                    setPlayingState(false);
                    staffManager.updateStatus(t('status.noAudio'));
                }
            },
            isRepeat
                ? { leadIn: LOOP_PAUSE_SECONDS, tailMs: 0, metronome: staffManager.metronome, beatsPerBar: staffManager.measureBeats() }
                : { metronome: staffManager.metronome, beatsPerBar: staffManager.measureBeats() });
            
            if (!started) return;
            
            setPlayingState(true);
            
            if (staffManager.loopPlayback) {
                staffManager.updateStatus(t('status.playingLoop', {
                    tempo: staffManager.tempo,
                    count: sequence.length,
                    repeat: repeatText,
                    from: fromText
                }));
            } else {
                const seconds = Playback.totalSeconds(sequence, staffManager.tempo);
                staffManager.updateStatus(t('status.playing', {
                    tempo: staffManager.tempo,
                    count: sequence.length,
                    repeat: repeatText,
                    from: fromText,
                    seconds: seconds.toFixed(1)
                }));
            }
        }
        
        // Включён отсчёт - сначала три секунды с цифрами, потом игра
        if (staffManager.countIn) {
            staffManager.runCountIn(() => start());
        } else {
            start();
        }
    }
    
    // Место выделенной ноты в порядке воспроизведения.
    // 0 - если ничего не выделено или выделен первый элемент.
    function selectedStartIndex(sequence) {
        const id = staffManager.selectedNoteId;
        if (!id) return 0;
        
        const selected = staffManager.notes.find(note => note.id === id);
        if (!selected) return 0;
        
        const index = sequence.indexOf(selected);
        return index > 0 ? index : 0;
    }
    
    // Пробел запускает и останавливает проигрывание
    function isTypingTarget(node) {
        if (!node || !node.tagName) return false;
        const tag = node.tagName.toLowerCase();
        if (tag === 'textarea' || tag === 'select') return true;
        if (node.isContentEditable === true) return true;
        
        // Из полей ввода текстом считаются только текстовые: у ползунка
        // размера и у флажков своих сочетаний нет, и Ctrl+Z в них должен
        // работать как откат действия, а не пропадать
        if (tag !== 'input') return false;
        
        const type = (node.type || 'text').toLowerCase();
        return ['text', 'number', 'search', 'email', 'password', 'tel', 'url'].indexOf(type) >= 0;
    }
    
    function toggleMelody() {
        if (staffManager.melodyPlayer && staffManager.melodyPlayer.playing) {
            stopMelody();
        } else {
            playMelody();
        }
    }
    
    document.addEventListener('keydown', (event) => {
        // В полях ввода клавиши остаются своими: в поле темпа стрелки
        // меняют число, в ползунке размера - размер картинки
        if (isTypingTarget(event.target)) return;
        
        // Ctrl+Z - откат, Ctrl+Y или Ctrl+Shift+Z - возврат.
        // Клавишу определяем по физической позиции (code), а не по символу:
        // на русской раскладке та же клавиша даёт "я", и сочетание не срабатывало
        if ((event.ctrlKey || event.metaKey) && !event.altKey) {
            const key = (event.key || '').toLowerCase();
            const isZ = event.code === 'KeyZ' || key === 'z' || key === 'я';
            const isY = event.code === 'KeyY' || key === 'y' || key === 'н';
            
            if (isZ) {
                event.preventDefault();
                if (event.shiftKey) {
                    staffManager.redo();
                } else {
                    staffManager.undo();
                }
                return;
            }
            
            if (isY) {
                event.preventDefault();
                staffManager.redo();
                return;
            }
        }
        
        const isSpace = event.key === ' ' || event.code === 'Space';
        
        if (isSpace) {
            if (event.repeat) return;
            
            // На кнопке или ссылке пробел нажимает её - не отбираем
            if (event.target && event.target.closest && event.target.closest('button, a')) return;
            
            // При открытом окне «О проекте» пробел не должен включать музыку
            if (document.querySelector('#about-modal:not([hidden]), #help-modal:not([hidden])')) return;
            
            event.preventDefault();
            toggleMelody();
            return;
        }
        
        const isLeft = event.key === 'ArrowLeft';
        const isRight = event.key === 'ArrowRight';
        const isUp = event.key === 'ArrowUp';
        const isDown = event.key === 'ArrowDown';
        
        // Стрелки, а также Delete и Insert обрабатываются ниже
        const isDelete = event.key === 'Delete';
        const isInsert = event.key === 'Insert';
        if (!isLeft && !isRight && !isUp && !isDown && !isDelete && !isInsert) return;
        
        // При открытом окне стрелки не должны двигать ноты за ним
        if (document.querySelector('#about-modal:not([hidden]), #help-modal:not([hidden])')) return;
        
        // Влево и вправо - переход по ногам
        if (isLeft || isRight) {
            event.preventDefault();
            staffManager.moveSelection(isRight ? 1 : -1);
            return;
        }
        
        // Alt со стрелкой - длительность выделенного
        if (event.altKey && (isUp || isDown)) {
            event.preventDefault();
            staffManager.changeSelectedDuration(isUp ? 1 : -1);
            return;
        }
        
        // Shift со стрелкой вверх или вниз - смена высоты ноты
        if (event.shiftKey && (isUp || isDown)) {
            event.preventDefault();
            staffManager.changeSelectedNotePitch(isUp ? 1 : -1);
            return;
        }
        
        // Delete - удалить выделенную ноту или паузу
        if (event.key === 'Delete') {
            event.preventDefault();
            staffManager.deleteSelectedNote();
            return;
        }
        
        // Insert - вставить ноту, Shift+Insert - паузу
        if (event.key === 'Insert') {
            event.preventDefault();
            if (event.shiftKey) {
                staffManager.insertRestBefore();
            } else {
                staffManager.insertNoteBefore();
            }
        }
    });
    
    function stopMelody() {
        staffManager.clearCountIn();
        staffManager.melodyPlayer.stop();
        staffManager.highlightElement(null);
        setPlayingState(false);
        staffManager.updateStatus(t('status.playStopped'));
    }
    
    // Автосохранение при закрытии - подстраховка к автосохранению после каждого изменения
    window.addEventListener('beforeunload', () => {
        staffManager.saveToLocalStorage(true);
    });
    
    // Размер такта и режим тактовых черт
    document.getElementById('time-signature').addEventListener('change', (e) => {
        staffManager.setTimeSignature(e.target.value);
    });
    
    document.querySelectorAll('input[name="barline-mode"]').forEach(radio => {
        radio.addEventListener('change', (e) => {
            staffManager.setBarLineMode(e.target.value);
        });
    });
    
    // Управление тактовыми чертами
    document.getElementById('btn-add-barline').addEventListener('click', () => {
        staffManager.addBarLine();
    });
    
    document.getElementById('btn-remove-barline').addEventListener('click', () => {
        staffManager.removeBarLine();
    });
    
    // Реприза
    document.getElementById('btn-repeat-start').addEventListener('click', () => {
        staffManager.toggleRepeatStart();
    });
    
    document.getElementById('btn-repeat-end').addEventListener('click', () => {
        staffManager.toggleRepeatEnd();
    });
    
    // Автозагрузка при старте
    setTimeout(() => {
        staffManager.loadFromLocalStorage();
    }, 100);
    
    console.log('Saxophone Fingering Assistant - Full Range Version загружен');
});