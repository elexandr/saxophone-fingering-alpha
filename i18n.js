// Saxophone Fingering Assistant - локализация интерфейса.
//
// Язык берётся из сохранённой настройки, иначе из языка браузера.
// Хранение: сначала куки, а если браузер их не принимает (так ведёт себя
// file:// в Chrome), настройка уходит в localStorage.
// Словари чистые, модуль работает и в браузере, и в Node (для проверок).

(function (root, factory) {
    var api = factory();
    if (typeof module === 'object' && module.exports) {
        module.exports = api;
    } else {
        root.I18n = api;
    }
}(typeof window !== 'undefined' ? window : this, function () {
    'use strict';

    var LANGS = ['ru', 'en'];
    var DEFAULT_LANG = 'ru';
    var COOKIE_LANG = 'saxophone_lang';
    var COOKIE_CONSENT = 'saxophone_consent';
    var LS_PREFIX = 'saxophone-';

    var DICT = {
        ru: {
            'app.docTitle': 'Saxophone Fingering Assistant — аппликатуры саксофона',
            'app.title': 'Saxophone Fingering Assistant',
            'app.notes': 'Нот:',
            'app.selected': 'Выделенная:',
            'app.none': 'нет',
            'app.range': 'Диапазон:',
            'app.about': 'О проекте',
            'app.aboutHint': 'Что это за приложение и для чего оно',

            'panel.notes': 'Управление нотами',
            'panel.notes.hint': 'Поднять или опустить выделенную ноту на полтона, удалить её или очистить весь стан',
            'btn.noteUp': 'Поднять ноту',
            'btn.noteUp.hint': 'Поднять выделенную ноту на полтона (Shift+вверх)',
            'btn.noteDown': 'Опустить ноту',
            'btn.noteDown.hint': 'Опустить выделенную ноту на полтона (Shift+вниз)',
            'btn.delete': 'Удалить ноту',
            'btn.insert': 'Вставить ноту',
            'btn.insert.hint': 'Вставить перед выделенной ноту той же высоты, что предыдущая (Insert)',
            'btn.delete.hint': 'Удалить выделенную ноту или паузу (Delete)',
            'btn.clear': 'Очистить все',
            'btn.clear.hint': 'Удалить все ноты и паузы, спросив подтверждение',

            'panel.rests': 'Паузы',
            'panel.rests.hint': 'Пауза встаёт после выделенного элемента, а если ничего не выделено — в конец мелодии. Длительность и точка задаются окошком над каждой нотой и паузой',
            'btn.addRest': 'Добавить паузу',
            'btn.undo': 'Отменить',
            'btn.redo': 'Вернуть',
            'btn.undo.hint': 'Откатить последнее действие (Ctrl+Z)',
            'btn.redo.hint': 'Вернуть отменённое действие (Ctrl+Y)',
            'btn.addRest.hint': 'Вставить паузу перед выделенной нотой, а если ничего не выделено — в конец мелодии (Shift+Insert)',

            'panel.play': 'Воспроизведение',
            'panel.play.hint': 'Мелодия играется с начала с учётом длительностей, точек, пауз и репризы. Звук синтезирует сам браузер, интернет не нужен',
            'setting.tempo': 'Темп, BPM:',
            'setting.tempo.hint': 'Темп от 30 до 240 ударов в минуту',
            'setting.loop': 'Играть по кругу',
            'setting.metronome': 'Метроном',
            'setting.metronome.hint': 'Щелчки по темпу во время игры',
            'setting.metronome.volumeHint': 'Громкость метронома',
            'setting.countIn': 'Отсчёт перед началом',
            'setting.countIn.hint': 'Три секунды с отсчётом 3-2-1 перед началом игры',
            'setting.loop.hint': 'Повторять мелодию, пока не нажмёте «Стоп»',
            'btn.play': 'Играть',
            'btn.play.hint': 'Проиграть мелодию (или пробел). Если нота выделена, играем с неё',
            'btn.stop': 'Стоп',
            'btn.stop.hint': 'Остановить воспроизведение',

            'panel.measures': 'Размер и такты',
            'panel.measures.hint': 'Автоматически черты встают по сумме длительностей. Нота, переходящая через границу такта, помечается оранжевым пунктиром. Клик по черте выделяет ноту перед ней',
            'setting.signature': 'Размер такта:',
            'setting.signature.hint': 'Размер такта: 2/4, 3/4, 4/4 или 6/8',
            'setting.barlines': 'Тактовые черты:',
            'setting.barlines.auto': 'Автоматически',
            'setting.barlines.autoHint': 'Черты ставятся сами по размеру такта',
            'setting.barlines.manual': 'Вручную',
            'setting.barlines.manualHint': 'Черты ставятся кнопками у выделенного элемента',
            'btn.addBarline': 'Добавить черту',
            'btn.addBarline.hint': 'Поставить черту после выделенного элемента (ручной режим)',
            'btn.removeBarline': 'Удалить черту',
            'btn.removeBarline.hint': 'Убрать черту у выделенного элемента (ручной режим)',

            'panel.repeat': 'Реприза',
            'panel.repeat.hint': 'Отметьте начало и конец: этот участок сыграется дважды. Если отмечен только конец — повтор идёт с начала мелодии. Кнопки действуют на выделенный элемент',
            'btn.repeatStart': 'Начать репризу',
            'btn.repeatStart.hint': 'Отметить начало репризы перед выделенным элементом',
            'btn.repeatEnd': 'Закончить репризу',
            'btn.repeatEnd.hint': 'Отметить конец репризы после выделенного элемента. Без парного начала повтор идёт с начала мелодии',

            'panel.save': 'Сохранение',
            'panel.save.hint': 'Сохранить мелодию в файл JSON или загрузить ранее сохранённую. Мелодия также сохраняется автоматически после каждого изменения',
            'btn.save': 'Сохранить',
            'btn.save.hint': 'Сохранить мелодию в файл JSON',
            'btn.load': 'Загрузить',
            'btn.load.hint': 'Загрузить мелодию из файла JSON',
            'btn.midi': 'Загрузить MIDI',
            'btn.midiSave': 'Сохранить MIDI',
            'btn.midiSave.hint': 'Сохранить мелодию в файл MIDI для другой музыкальной программы. Записываются высота, длительность и темп, аппликатуры в MIDI не хранятся',
            'btn.midi.hint': 'Загрузить мелодию из MIDI-файла (.mid)',
            'midi.badFile': 'файл повреждён или это не MIDI',
            'midi.failed': 'Не удалось прочитать MIDI: {reason}',
            'midi.empty': 'В MIDI-файле не нашлось нот',
            'midi.loaded': 'Из MIDI: нот {notes}, пауз {rests}',
            'midi.monophonic': ' · одноголосый',
            'midi.polyphonic': ' · многоголосый: до {max} нот одновременно, для саксофона взята верхняя линия',
            'midi.shifted': ' · мелодия перенесена на {semitones} полутонов, чтобы попасть в диапазон саксофона',
            'midi.skipped': ' · {n} нот вне диапазона пропущено',

            'panel.edit': 'Редактирование',
            'panel.edit.hint': 'Правка мелодии: ноты, паузы, реприза, размер и транспонирование',
                        'panel.instrument': 'Транспонирование инструмента',
            'panel.instrument.hint': 'Сдвиг звука под ваш саксофон. Ноты и аппликатуры не меняются',
            'instrument.example': 'Нота C4: приложение играет {app}, саксофон {sax}',
            'instrument.transpose.hint': 'Сдвиг звука: 0 — нота звучит как записана, −12 — на октаву ниже',
            'instrument.soprano': 'Сопрано',
            'instrument.alto': 'Альт',
            'instrument.tenor': 'Тенор',
            'instrument.baritone': 'Баритон',
            'btn.instrumentMinus.hint': 'На полутон ниже',
            'btn.instrumentPlus.hint': 'На полутон выше',
            'btn.tempoMinus.hint': 'Медленнее на 5',
            'btn.tempoPlus.hint': 'Быстрее на 5',
            'status.instrumentTranspose': 'Сдвиг инструмента: {value} полутонов',
            'panel.presets': 'Инструменты',
            'panel.presets.hint': 'Готовые настройки: саксофоны, гитара, пианино',
            'panel.fine': 'Тонкая настройка',
            'panel.fine.hint': 'Сдвиги звука и подписи нот',
            'fine.app': 'Сдвиг звука приложения',
            'fine.app.hint': 'Насколько звук приложения отличается от нот на стане',
            'fine.sax': 'Сдвиг звука инструмента',
            'fine.sax.hint': 'Насколько саксофон звучит выше или ниже взятой аппликатуры',
            'fine.linked': 'Показывать звучащие ноты',
            'fine.linked.hint': 'Включено: подписи звучащих нот. Выключено: написанные, как в нотах у пианино. На аппликатуру не влияет',
            'instrument.guitar': 'Гитара',
            'instrument.piano': 'Пианино',
            'status.shifts': 'Звук приложения {app}, звук инструмента {sax}',
'panel.transpose': 'Транспонирование мелодии',
            'panel.transpose.hint': 'Поднять или опустить всю мелодию на полтона',
            'panel.settings': 'Настройки',
            'panel.settings.hint': 'Размер картинок аппликатур, показ названий нот и аппликатур, режим альтераций',
            'setting.imageSize': 'Размер картинок:',
            'setting.imageSize.hint': 'Ширина картинок аппликатур: от 50 до 200 пикселей',
            'setting.noteNames': 'Показывать названия нот',
            'setting.noteNames.hint': 'Показывать название ноты под знаком',
            'setting.fingerings': 'Показывать аппликатуры',
            'setting.fingerings.hint': 'Скрыть или показать ряды аппликатур под станом',
            'setting.accidentals': 'Отображение альтераций:',
            'setting.accidentals.hint': 'Переключатель переписывает уже добавленные ноты',
            'setting.accidentals.sharps': 'Диезы (#)',
            'setting.accidentals.sharpsHint': 'Показывать альтерации диезами: C#4',
            'setting.accidentals.flats': 'Бемоли (b)',
            'setting.accidentals.flatsHint': 'Показывать альтерации бемолями: Db4',

            'btn.transposeUp': 'Все вверх',
            'btn.transposeUp.hint': 'Транспонировать все ноты на полтона вверх',
            'btn.transposeDown': 'Все вниз',
            'btn.transposeDown.hint': 'Транспонировать все ноты на полтона вниз',

            'staff.measures': 'Размер: {signature} · Тактов: {n}',
            'staff.metre': 'Размер: {signature}',
            'staff.fingerings': 'Аппликатур: {n}',
            'staff.noSelection': 'Нет выделенной ноты',
            'staff.staffTitle': 'Кликните на маркер позиции, чтобы добавить ноту. Клик по ноте выделяет её и озвучивает. Стрелки влево и вправо переключают ноты, Shift со стрелкой вверх или вниз меняет высоту. Insert вставляет ноту перед выделенной, Shift+Insert — паузу',
            'staff.clef': 'Скрипичный ключ',
            'marker.title': '{name} — позиция {position}',

            'status.ready': 'Готов к работе. Кликните на маркер позиции, чтобы добавить ноту.',
            'status.addedNote': 'Добавлена нота: {name} (позиция {position})',
            'status.addedRest': 'Добавлена пауза',
            'status.selectedNote': 'Выбрана нота: {name}',
            'status.selectedRest': 'Выбрана пауза',
            'status.deselected': 'Нота снята с выделения',
            'status.restNoPitch': 'У паузы нет высоты',
            'status.pitchLimit': 'Невозможно изменить высоту ноты (достигнут предел диапазона)',
            'status.positionMissing': 'Позиция {position} не найдена для ноты {name}',
            'status.melodySaved': 'Мелодия сохранена в файл',
            'status.noteChanged': 'Нота изменена: {name}',
            'status.noteDeleted': 'Удалена нота: {name}',
            'status.restDeleted': 'Пауза удалена',
            'status.undone': 'Последнее действие отменено',
            'status.redone': 'Отменённое действие возвращено',
            'status.nothingToUndo': 'Отменять нечего',
            'status.nothingToRedo': 'Возвращать нечего',
            'status.allCleared': 'Все ноты удалены',
            'status.noNotesToTranspose': 'Нет нот для транспонирования',
            'status.transposed': 'Транспонировано нот: {n}',
            'status.noVariants': 'У этой ноты нет вариантов аппликатур',
            'status.restNoFingering': 'У паузы нет аппликатуры',
            'status.variantChanged': 'Вариант аппликатуры изменён: {current}/{total}',
            'status.variantChangedMany': 'Вариант аппликатуры изменён: {current}/{total}. Так же обновлено нот: {count}',
            'status.durationLimit': 'Длиннее или короче уже некуда',
            'status.noteInserted': 'Вставлена нота {name}',
            'status.restInserted': 'Вставлена пауза',
            'status.durationSet': 'Длительность: {name}',
            'status.durationSetDotted': 'Длительность: {name} с точкой',
            'status.dotsSet': 'Точек у ноты: {count}',
            'status.dotOn': 'Точка включена',
            'status.dotOff': 'Точка выключена',

            'rest.word': 'пауза',
            'rest.info': 'Пауза, {name}',
            'rest.infoDotted': 'Пауза, {name} с точкой',
            'rest.inRow': 'Пауза ({name})',
            'note.info': '{name} (позиция {position})',
            'note.crossesBoundary': 'Нота звучит через границу такта — оранжевый пунктир',
            'target.note': 'ноты {name}',
            'target.rest': 'паузы',

            'barline.title': 'Тактовая черта после {target}',
            'barline.repeatStartTitle': 'Начало репризы перед {target} (клик — убрать)',
            'barline.repeatEndTitle': 'Конец репризы после {target} (клик — убрать)',
            'status.repeatStartOn': 'Начало репризы отмечено',
            'status.repeatStartOff': 'Начало репризы снято',
            'status.repeatEndOn': 'Конец репризы отмечен',
            'status.repeatEndOff': 'Конец репризы снят',
            'status.selectForRepeatStart': 'Выделите элемент, чтобы отметить начало репризы',
            'status.selectForRepeatEnd': 'Выделите элемент, чтобы отметить конец репризы',
            'status.barlinesAuto': 'Тактовые черты ставятся автоматически по размеру',
            'status.barlinesManual': 'Тактовые черты ставятся вручную',
            'status.manualOnly': 'Черты ставятся автоматически: переключите режим на «Вручную»',
            'status.selectForBarline': 'Выделите элемент, чтобы добавить тактовую черту после него',
            'status.barlineAdded': 'Добавлена тактовая черта после {target}',
            'status.barlineMissing': 'У {target} нет тактовой черты',
            'status.barlineRemoved': 'Удалена тактовая черта после {target}',
            'status.barlinesCleared': 'Все тактовые черты удалены',
            'status.signatureSet': 'Размер {signature}: тактов {n}',
            'status.sharps': 'Альтерации показаны диезами',
            'status.flats': 'Альтерации показаны бемолями',

            'status.playing': 'Играем: {tempo} BPM, элементов {count}{repeat}{from}, около {seconds} с',
            'status.playingLoop': 'Играем по кругу: {tempo} BPM, элементов {count}{repeat}{from}',
            'status.playingFrom': ' · с выделенной ноты',
            'status.loopPause': 'Пауза перед повтором — стан поднимается на первую строку',
            'status.playingRepeat': ', реприза {n}',
            'status.playDone': 'Воспроизведение завершено',
            'status.playStopped': 'Воспроизведение остановлено',
            'status.addNotesFirst': 'Сначала добавьте ноты на нотный стан',
            'status.noAudio': 'Браузер не поддерживает воспроизведение звука',

            'status.noSavedMelody': 'Сохранённых мелодий нет — начинаем с чистого стана',
            'status.lastMelody': 'Открыта последняя мелодия (сохранена {when})',
            'status.lastMelodyPlain': 'Открыта последняя мелодия',
            'status.savedLocal': 'Данные сохранены в LocalStorage',
            'status.saveError': 'Ошибка сохранения: {message}',
            'status.loadError': 'Ошибка загрузки: {message}',
            'status.fileReadError': 'Ошибка чтения файла',
            'status.fileLoadError': 'Ошибка загрузки файла: {message}',
            'status.midiSaved': 'Сохранено нот в MIDI: {count}',
            'status.exportEmpty': 'В мелодии нет нот — сохранять нечего',
            'status.addOnlyInLastBar': 'Новые ноты ставятся только в последнем такте',
            'status.melodyLoaded': 'Мелодия загружена из файла',
            'status.confirmClear': 'Вы уверены, что хотите удалить все ноты?',

            'status.caching': 'Кэширование аппликатур: {done} из {total}',
            'status.cacheReady': 'Аппликатуры в кэше: {n}',
            'status.cacheFallback': 'Аппликатуры: прямая загрузка',

            'card.noFingering': 'Нет аппликатуры',
            'card.imageAlt': 'Аппликатура для {name}',
            'cards.placeholderText': 'Добавьте ноты, чтобы увидеть аппликатуры',
            'cards.count': 'Аппликатур: {n}',
            'cards.none': 'Аппликатур: 0',
            'cards.noFingeringFor': 'Аппликатура для {name} отсутствует',
            'notes.count': '{n}',
            'notes.countWithRests': '{n} + {m} {word}',
            'rests.short.one': 'пауза',
            'rests.short.few': 'паузы',
            'rests.short.many': 'пауз',

            'duration.1': 'целая',
            'duration.2': 'половинная',
            'duration.4': 'четвертная',
            'duration.8': 'восьмая',
            'duration.16': 'шестнадцатая',
            'duration.buttonTitle': 'Длительность (Alt+вверх — длиннее, Alt+вниз — короче)',
            'duration.dot1': 'Одна точка: длительность умножается на 1.5',
            'duration.dot2': 'Две точки: умножается на 1.75',
            'duration.dot3': 'Три точки: умножается на 1.875',
            'duration.dotTitle': 'Точка к длительности: нажмите, чтобы добавить одну, две или три',

            'consent.text': 'Чтобы открывать приложение на выбранном языке, мы сохраняем настройку в вашем браузере: в куки, а если браузер их не принимает — в локальном хранилище.',
            'consent.ok': 'Понятно',
            'help.button': 'Помощь',
            'help.hint': 'Подробная справка: возможности, кнопки, горячие клавиши',
            'help.close': 'Закрыть',
            'help.title': 'Справка',
            'help.intro': 'Приложение показывает аппликатуры саксофона для нот, которые вы расставляете на стане. Слева панель управления, в центре стан и ряд аппликатур, внизу строка состояния. Мелодию можно сохранить в файл или выгрузить в MIDI.',
            'help.startTitle': 'С чего начать',
            'help.start1': 'Щёлкните по последнему такту стана — там появится нота. Новые ноты добавляются только в последнем такте.',
            'help.start2': 'Выберите длительность кнопкой в разделе «Длительность» или клавишами Alt со стрелками.',
            'help.start3': 'Нажмите «Играть»: мелодия зазвучит, а аппликатура звучащей ноты подсветится.',
            'help.start4': 'Сохраните мелодию в файл или выгрузите её в MIDI, чтобы открыть в другой программе.',
            'help.notesTitle': 'Ноты и паузы',
            'help.note1': 'Высота новой ноты определяется по тому месту стана, куда вы щёлкнули: по линии или по промежутку между линиями.',
            'help.note2': '«Вставить ноту» добавляет ноту перед выделенной, «Добавить паузу» — паузу перед выделенной. Если ничего не выделено, они уходят в конец мелодии.',
            'help.note3': 'Щелчок по существующей ноте выделяет её, и она сразу звучит. Повторный щелчок снимает выделение.',
            'help.note4': 'Клавиша Delete удаляет выделенную ноту или паузу.',
            'help.note5': 'Репризы ставятся кнопками в разделе «Повторы»: участок между ними во время игры проигрывается дважды.',
            'help.durTitle': 'Длительность и точки',
            'help.dur1': 'Кнопки слева направо: целая, половинная, четвертная, восьмая, шестнадцатая.',
            'help.dur2': 'Точки добавляются отдельными кнопками: одна, две или три. Одна точка удлиняет ноту в полтора раза, две — в 1.75, три — в 1.875.',
            'help.dur3': 'Новая нота берёт длительность у предыдущей. Четвертная остаётся только для первой ноты в мелодии.',
            'help.dur4': 'Клавиши Alt со стрелками вверх и вниз делают выделенную ноту длиннее или короче, не сбрасывая точки.',
            'help.editTitle': 'Выделение и правка',
            'help.edit1': 'Стрелки влево и вправо переходят по нотам, и каждая выделенная нота звучит.',
            'help.edit2': 'Shift со стрелками вверх и вниз меняет высоту выделенной ноты на полутон.',
            'help.edit3': 'Откат действия — Ctrl+Z, возврат — Ctrl+Y или Ctrl+Shift+Z. Хранятся последние 50 действий.',
            'help.edit4': 'Размер такта выбирается в списке: 4/4, 3/4, 2/4 или 6/8.',
            'help.edit5': 'Тактовые черты можно ставить вручную или доверить приложению — переключатель рядом с размером.',
            'help.playTitle': 'Воспроизведение',
            'help.play1': 'Кнопки «Играть» и «Стоп», а на компьютере ещё и пробел. Если нот нет, приложение подскажет их добавить.',
            'help.play2': 'Темп задаётся в ударах в минуту в поле рядом с кнопками.',
            'help.play3': 'Если нота выделена, игра начинается с неё, а не с начала мелодии.',
            'help.play4': 'Игра по кругу повторяет мелодию без конца, с короткой паузой между кругами.',
            'help.play5': 'Метроном отсчитывает доли в текущем темпе: флажок включает его, ползунок задаёт громкость. Сильная доля звучит выше и громче, громкость мелодии при этом не меняется.',
            'help.play6': 'Отсчёт 3-2-1 показывает три секунды перед началом: крупные полупрозрачные цифры по центру экрана. Если метроном включён, отсчёт идёт со щелчками.',
            'help.trTitle': 'Транспонирование',
            'help.tr1': 'Кнопки «Все вверх» и «Все вниз» сдвигают всю мелодию на полутон за нажатие.',
            'help.tr2': 'Знаки при этом пересчитываются, а выбор диезов или бемолей задаётся в настройках.',
            'help.tr3': 'Инструменты — это пресеты: сопрано −2, альт −9, тенор −14, баритон −21, гитара −12, пианино 0. Нажатие выставляет значения в тонкой настройке, и совпавший пресет горит зелёным.',
            'help.tr4': 'В тонкой настройке два сдвига: звука приложения и звука инструмента, плюс флажок «Показывать написанные ноты». Включённый флажок подписывает ноты как в саксофонных нотах, выключенный — как они звучат. Аппликатура от флажка не зависит: приложение всегда показывает ту, которой этот звук берётся на инструменте — так и подбирают удобный вариант.',
            'help.filesTitle': 'Файлы и MIDI',
            'help.file1': '«Сохранить мелодию» записывает файл .json: в нём и ноты, и настройки. «Открыть мелодию» читает такой файл обратно.',
            'help.file2': '«Импорт MIDI» разбирает файл .mid и расставляет ноты на стане.',
            'help.file3': '«Экспорт MIDI» сохраняет мелодию в .mid для другой программы.',
            'help.file4': 'Мелодия автоматически сохраняется в браузере и восстанавливается при следующем открытии страницы.',
            'help.file5': 'Кнопка сохранения заблокирована, пока в мелодии нет нот.',
            'help.setTitle': 'Настройки',
            'help.set1': 'Язык — русский или английский, переключатель в шапке.',
            'help.set2': 'Показ названий нот под знаками можно включить или выключить.',
            'help.set3': 'Вывод знаков: диезы или бемоли. Переключение переписывает уже добавленные ноты.',
            'help.set4': 'Размер картинок аппликатур — от 50 до 200 пикселей.',
            'help.set5': 'Кэш картинок ускоряет загрузку: рядом видно, сколько аппликатур в нём сохранено.',
            'help.mobTitle': 'На планшете',
            'help.mob1': 'Ноты добавляются касанием по последнему такту.',
            'help.mob2': 'Панель слева прокручивается: до нижних настроек нужно докрутить.',
            'help.mob3': 'У выделенной ноты открывается панель с длительностями — менять их можно прямо у ноты.',
            'help.keysTitle': 'Горячие клавиши на компьютере',
            'help.keyPlay': 'играть и остановить',
            'help.keyMove': 'переход по нотам',
            'help.keyPitch': 'повысить или понизить ноту на полутон',
            'help.keyDuration': 'сделать длительность больше или меньше',
            'help.keyDelete': 'удалить выделенную ноту или паузу',
            'help.keyInsertNote': 'вставить ноту перед выделенной',
            'help.keyInsertRest': 'вставить паузу перед выделенной',
            'help.keyUndo': 'откат действия',
            'help.keyRedo': 'возврат действия',
            'help.goalTitle': 'Про удобные аппликатуры',
            'help.goal1': 'Одна из первых задач приложения — сделать удобным транспонирование на электронном саксофоне: автор играет на YDS-120 и подбирал аппликатуры именно так.',
            'help.goal2': 'Способ простой. Выберите «Гитара» или «Пианино» и запишите мелодию в стандартном строе — так, как она должна звучать. Затем в тонкой настройке двигайте «Сдвиг звука инструмента»: аппликатуры меняются вместе со значением, пока не найдётся самая удобная.',
            'help.goal3': 'Найденное значение останется внести в пользовательский пресет инструмента, в поле «Транспонирование». После этого та же мелодия играется теми клавишами, которые удобны именно вам.',
'about.title': 'О проекте',
            'about.close': 'Закрыть',
            'about.p1': 'Saxophone Fingering Assistant — удобный инструмент для тех, кто осваивает саксофон.',
            'about.p2': 'Он помогает разобраться с аппликатурами: вы набираете мелодию на нотном стане, и под каждой нотой сразу видно, как ставить пальцы. Если ноту можно сыграть несколькими способами — можно выбрать удобный.',
            'about.p3': 'Кроме аппликатур, приложение помогает быстро транспонировать мелодию, записывать ритм (длительности и паузы), ставить репризу и прослушивать набранную мелодию.',
            'about.p4': 'Можно включить повтор и отрабатывать мелодию в нужном темпе.',
            'about.p5': 'Всё работает прямо в браузере. Мелодию можно сохранить себе на устройство, а потом загрузить обратно и продолжить с ней работать.',
            'about.p6': 'Также можно загрузить одноголосый MIDI-файл.',
            'about.p7': 'Автор сам учится играть на электронном саксофоне YDS-120 и сделал этот инструмент для себя — чтобы учиться быстрее.',
            'about.p8': 'Всем музыкальных успехов!',
            'about.contact': 'Для связи',
            'about.contactShow': 'показать адрес'
        },

        en: {
            'app.docTitle': 'Saxophone Fingering Assistant — saxophone fingerings',
            'app.title': 'Saxophone Fingering Assistant',
            'app.notes': 'Notes:',
            'app.selected': 'Selected:',
            'app.none': 'none',
            'app.range': 'Range:',
            'app.about': 'About',
            'app.aboutHint': 'What this app is and what it is for',

            'panel.notes': 'Note editing',
            'panel.notes.hint': 'Raise or lower the selected note by a semitone, delete it, or clear the whole staff',
            'btn.noteUp': 'Raise note',
            'btn.noteUp.hint': 'Raise the selected note by a semitone (Shift+Up)',
            'btn.noteDown': 'Lower note',
            'btn.noteDown.hint': 'Lower the selected note by a semitone (Shift+Down)',
            'btn.delete': 'Delete note',
            'btn.insert': 'Insert note',
            'btn.insert.hint': 'Insert before the selected note a note of the previous pitch (Insert)',
            'btn.delete.hint': 'Delete the selected note or rest (Delete)',
            'btn.clear': 'Clear all',
            'btn.clear.hint': 'Delete every note and rest, asking for confirmation',

            'panel.rests': 'Rests',
            'panel.rests.hint': 'A rest is inserted after the selected element, or at the end of the melody if nothing is selected. Duration and dot are set in the box above each note and rest',
            'btn.addRest': 'Add rest',
            'btn.undo': 'Undo',
            'btn.redo': 'Redo',
            'btn.undo.hint': 'Undo the last action (Ctrl+Z)',
            'btn.redo.hint': 'Redo the undone action (Ctrl+Y)',
            'btn.addRest.hint': 'Insert a rest before the selected note, or at the end when nothing is selected (Shift+Insert)',

            'panel.play': 'Playback',
            'panel.play.hint': 'The melody plays from the start, honouring durations, dots, rests and repeats. The sound is synthesised by the browser, no internet needed',
            'setting.tempo': 'Tempo, BPM:',
            'setting.tempo.hint': 'Tempo from 30 to 240 beats per minute',
            'setting.loop': 'Loop playback',
            'setting.metronome': 'Metronome',
            'setting.metronome.hint': 'Ticks in time with the tempo while playing',
            'setting.metronome.volumeHint': 'Metronome volume',
            'setting.countIn': 'Count-in',
            'setting.countIn.hint': 'Three seconds with a 3-2-1 count before playback',
            'setting.loop.hint': 'Repeat the melody until you press Stop',
            'btn.play': 'Play',
            'btn.play.hint': 'Play the melody (or press Space). If a note is selected, playback starts from it',
            'btn.stop': 'Stop',
            'btn.stop.hint': 'Stop playback',

            'panel.measures': 'Metre and bars',
            'panel.measures.hint': 'In automatic mode bar lines follow the sum of durations. A note crossing a bar line is marked with an orange dashed ring. Clicking a bar line selects the note before it',
            'setting.signature': 'Time signature:',
            'setting.signature.hint': 'Time signature: 2/4, 3/4, 4/4 or 6/8',
            'setting.barlines': 'Bar lines:',
            'setting.barlines.auto': 'Automatic',
            'setting.barlines.autoHint': 'Bar lines follow the time signature automatically',
            'setting.barlines.manual': 'Manual',
            'setting.barlines.manualHint': 'Bar lines are placed with buttons at the selected element',
            'btn.addBarline': 'Add bar line',
            'btn.addBarline.hint': 'Place a bar line after the selected element (manual mode)',
            'btn.removeBarline': 'Remove bar line',
            'btn.removeBarline.hint': 'Remove the bar line at the selected element (manual mode)',

            'panel.repeat': 'Repeat',
            'panel.repeat.hint': 'Mark the start and the end: that section plays twice. If only the end is marked, the repeat goes from the beginning of the melody. The buttons act on the selected element',
            'btn.repeatStart': 'Start repeat',
            'btn.repeatStart.hint': 'Mark the start of a repeat before the selected element',
            'btn.repeatEnd': 'End repeat',
            'btn.repeatEnd.hint': 'Mark the end of a repeat after the selected element. Without a matching start, the repeat goes from the beginning of the melody',

            'panel.save': 'Files',
            'panel.save.hint': 'Save the melody to a JSON file or load a saved one. The melody is also saved automatically after every change',
            'btn.save': 'Save',
            'btn.save.hint': 'Save the melody to a JSON file',
            'btn.load': 'Load',
            'btn.load.hint': 'Load a melody from a JSON file',
            'btn.midi': 'Load MIDI',
            'btn.midiSave': 'Save MIDI',
            'btn.midiSave.hint': 'Save the melody as a MIDI file for another music program. Pitch, duration and tempo are written; fingerings are not stored in MIDI',
            'btn.midi.hint': 'Load a melody from a MIDI file (.mid)',
            'midi.badFile': 'the file is damaged or is not MIDI',
            'midi.failed': 'Could not read the MIDI file: {reason}',
            'midi.empty': 'No notes found in the MIDI file',
            'midi.loaded': 'From MIDI: {notes} notes, {rests} rests',
            'midi.monophonic': ' · monophonic',
            'midi.polyphonic': ' · polyphonic: up to {max} notes at once, the top line was taken for the saxophone',
            'midi.shifted': ' · the melody was shifted by {semitones} semitones to fit the saxophone range',
            'midi.skipped': ' · {n} notes outside the range were skipped',

            'panel.edit': 'Editing',
            'panel.edit.hint': 'Edit the melody: notes, rests, repeats, metre and transposition',
                        'panel.instrument': 'Instrument transposition',
            'panel.instrument.hint': 'Sound shift for your saxophone. Notes and fingerings stay unchanged',
            'instrument.example': 'C4 note: the app plays {app}, the saxophone {sax}',
            'instrument.transpose.hint': 'Sound shift: 0 sounds as written, -12 is an octave lower',
            'instrument.soprano': 'Soprano',
            'instrument.alto': 'Alto',
            'instrument.tenor': 'Tenor',
            'instrument.baritone': 'Baritone',
            'btn.instrumentMinus.hint': 'One semitone lower',
            'btn.instrumentPlus.hint': 'One semitone higher',
            'btn.tempoMinus.hint': 'Slower by 5',
            'btn.tempoPlus.hint': 'Faster by 5',
            'status.instrumentTranspose': 'Instrument shift: {value} semitones',
            'panel.presets': 'Instruments',
            'panel.presets.hint': 'Ready settings: saxophones, guitar, piano',
            'panel.fine': 'Fine tuning',
            'panel.fine.hint': 'Sound shifts and note names',
            'fine.app': 'App sound shift',
            'fine.app.hint': 'How far the app sound differs from the staff notes',
            'fine.sax': 'Instrument sound shift',
            'fine.sax.hint': 'How far the saxophone sounds above or below the fingering taken',
            'fine.linked': 'Show sounding notes',
            'fine.linked.hint': 'On: names of the sounding notes. Off: written names, as on the piano. Does not affect fingerings',
            'instrument.guitar': 'Guitar',
            'instrument.piano': 'Piano',
            'status.shifts': 'App sound {app}, instrument sound {sax}',
'panel.transpose': 'Melody transposition',
            'panel.transpose.hint': 'Raise or lower the whole melody by a semitone',
            'panel.settings': 'Settings',
            'panel.settings.hint': 'Fingering image size, note names and fingerings visibility, accidental mode',
            'setting.imageSize': 'Image size:',
            'setting.imageSize.hint': 'Fingering image width: from 50 to 200 pixels',
            'setting.noteNames': 'Show note names',
            'setting.noteNames.hint': 'Show the note name under the symbol',
            'setting.fingerings': 'Show fingerings',
            'setting.fingerings.hint': 'Hide or show the fingering rows under the staff',
            'setting.accidentals': 'Accidentals:',
            'setting.accidentals.hint': 'Switching rewrites the notes already added',
            'setting.accidentals.sharps': 'Sharps (#)',
            'setting.accidentals.sharpsHint': 'Show accidentals as sharps: C#4',
            'setting.accidentals.flats': 'Flats (b)',
            'setting.accidentals.flatsHint': 'Show accidentals as flats: Db4',

            'btn.transposeUp': 'All up',
            'btn.transposeUp.hint': 'Transpose every note up by a semitone',
            'btn.transposeDown': 'All down',
            'btn.transposeDown.hint': 'Transpose every note down by a semitone',

            'staff.measures': 'Metre: {signature} · bars: {n}',
            'staff.metre': 'Metre: {signature}',
            'staff.fingerings': 'Fingerings: {n}',
            'staff.noSelection': 'No note selected',
            'staff.staffTitle': 'Click a position marker to add a note. Clicking a note selects and sounds it. Left and right arrows move between notes, Shift with up or down changes the pitch. Insert adds a note before the selected one, Shift+Insert adds a rest',
            'staff.clef': 'Treble clef',
            'marker.title': '{name} — position {position}',

            'status.ready': 'Ready. Click a position marker to add a note.',
            'status.addedNote': 'Note added: {name} (position {position})',
            'status.addedRest': 'Rest added',
            'status.selectedNote': 'Note selected: {name}',
            'status.selectedRest': 'Rest selected',
            'status.deselected': 'Note deselected',
            'status.restNoPitch': 'A rest has no pitch',
            'status.pitchLimit': 'Cannot change the pitch: the range limit is reached',
            'status.positionMissing': 'Position {position} not found for note {name}',
            'status.noteChanged': 'Note changed: {name}',
            'status.noteDeleted': 'Note deleted: {name}',
            'status.restDeleted': 'Rest deleted',
            'status.undone': 'Last action undone',
            'status.redone': 'Undone action restored',
            'status.nothingToUndo': 'Nothing to undo',
            'status.nothingToRedo': 'Nothing to redo',
            'status.allCleared': 'All notes deleted',
            'status.noNotesToTranspose': 'There are no notes to transpose',
            'status.transposed': 'Notes transposed: {n}',
            'status.noVariants': 'This note has no alternative fingerings',
            'status.restNoFingering': 'A rest has no fingering',
            'status.variantChanged': 'Fingering variant changed: {current}/{total}',
            'status.variantChangedMany': 'Fingering variant changed: {current}/{total}. Notes updated the same way: {count}',
            'status.durationLimit': 'No longer or shorter duration available',
            'status.noteInserted': 'Inserted note {name}',
            'status.restInserted': 'Inserted a rest',
            'status.durationSet': 'Duration: {name}',
            'status.durationSetDotted': 'Duration: {name} with a dot',
            'status.dotsSet': 'Dots on the note: {count}',
            'status.dotOn': 'Dot on',
            'status.dotOff': 'Dot off',

            'rest.word': 'rest',
            'rest.info': 'Rest, {name}',
            'rest.infoDotted': 'Rest, {name} with a dot',
            'rest.inRow': 'Rest ({name})',
            'note.info': '{name} (position {position})',
            'note.crossesBoundary': 'This note sounds across the bar line — orange dashes',
            'target.note': 'note {name}',
            'target.rest': 'the rest',

            'barline.title': 'Bar line after {target}',
            'barline.repeatStartTitle': 'Repeat start before {target} (click to remove)',
            'barline.repeatEndTitle': 'Repeat end after {target} (click to remove)',
            'status.repeatStartOn': 'Repeat start marked',
            'status.repeatStartOff': 'Repeat start removed',
            'status.repeatEndOn': 'Repeat end marked',
            'status.repeatEndOff': 'Repeat end removed',
            'status.selectForRepeatStart': 'Select an element to mark the repeat start',
            'status.selectForRepeatEnd': 'Select an element to mark the repeat end',
            'status.barlinesAuto': 'Bar lines follow the time signature automatically',
            'status.barlinesManual': 'Bar lines are placed manually',
            'status.manualOnly': 'Bar lines are automatic: switch the mode to Manual',
            'status.selectForBarline': 'Select an element to add a bar line after it',
            'status.barlineAdded': 'Bar line added after {target}',
            'status.barlineMissing': '{target} has no bar line',
            'status.barlineRemoved': 'Bar line after {target} removed',
            'status.barlinesCleared': 'All bar lines removed',
            'status.signatureSet': 'Time signature {signature}: {n} bars',
            'status.sharps': 'Accidentals shown as sharps',
            'status.flats': 'Accidentals shown as flats',

            'status.playing': 'Playing: {tempo} BPM, {count} steps{repeat}{from}, about {seconds} s',
            'status.playingLoop': 'Looping: {tempo} BPM, {count} steps{repeat}{from}',
            'status.playingFrom': ' · from the selected note',
            'status.loopPause': 'Pause before the repeat — the staff is moving up to the first line',
            'status.playingRepeat': ', {n} repeat(s)',
            'status.playDone': 'Playback finished',
            'status.playStopped': 'Playback stopped',
            'status.addNotesFirst': 'Add some notes to the staff first',
            'status.noAudio': 'This browser cannot play sound',

            'status.noSavedMelody': 'No saved melodies — starting from an empty staff',
            'status.lastMelody': 'Last melody restored (saved {when})',
            'status.lastMelodyPlain': 'Last melody restored',
            'status.savedLocal': 'Data saved to LocalStorage',
            'status.saveError': 'Save error: {message}',
            'status.loadError': 'Load error: {message}',
            'status.fileReadError': 'File read error',
            'status.fileLoadError': 'File load error: {message}',
            'status.midiSaved': 'Notes saved to MIDI: {count}',
            'status.exportEmpty': 'The melody has no notes to save',
            'status.addOnlyInLastBar': 'New notes are added in the last bar only',
            'status.melodySaved': 'Melody saved to a file',
            'status.melodyLoaded': 'Melody loaded from a file',
            'status.confirmClear': 'Delete every note?',

            'status.caching': 'Caching fingerings: {done} of {total}',
            'status.cacheReady': 'Fingerings cached: {n}',
            'status.cacheFallback': 'Fingerings: direct loading',

            'card.noFingering': 'No fingering',
            'card.imageAlt': 'Fingering for {name}',
            'cards.placeholderText': 'Add notes to see fingerings',
            'cards.count': 'Fingerings: {n}',
            'cards.none': 'Fingerings: 0',
            'cards.noFingeringFor': 'No fingering for {name}',
            'notes.count': '{n}',
            'notes.countWithRests': '{n} + {m} {word}',
            'rests.short.one': 'rest',
            'rests.short.other': 'rests',

            'duration.1': 'whole',
            'duration.2': 'half',
            'duration.4': 'quarter',
            'duration.8': 'eighth',
            'duration.16': 'sixteenth',
            'duration.buttonTitle': 'Duration (Alt+Up longer, Alt+Down shorter)',
            'duration.dot1': 'One dot: duration times 1.5',
            'duration.dot2': 'Two dots: times 1.75',
            'duration.dot3': 'Three dots: times 1.875',
            'duration.dotTitle': 'Duration dot: click to add one, two or three',

            'consent.text': 'To reopen the app in your language we store the setting in your browser: in a cookie, or in local storage if the browser rejects cookies.',
            'consent.ok': 'Got it',
            'help.button': 'Help',
            'help.hint': 'Full guide: features, buttons, keyboard shortcuts',
            'help.close': 'Close',
            'help.title': 'Help',
            'help.intro': 'The app shows saxophone fingerings for the notes you place on the staff. The control panel is on the left, the staff and the fingering row are in the middle, the status line is at the bottom. A melody can be saved to a file or exported to MIDI.',
            'help.startTitle': 'Getting started',
            'help.start1': 'Click the last bar of the staff — a note appears there. New notes are added in the last bar only.',
            'help.start2': 'Pick a duration with a button in the Duration section or with Alt and the arrow keys.',
            'help.start3': 'Press Play: the melody sounds and the fingering of the playing note is highlighted.',
            'help.start4': 'Save the melody to a file or export it to MIDI to open it in another program.',
            'help.notesTitle': 'Notes and rests',
            'help.note1': 'The pitch of a new note comes from the place you click: a line or a space between lines.',
            'help.note2': 'Insert note adds a note before the selected one, Add rest adds a rest before it. With nothing selected they go to the end of the melody.',
            'help.note3': 'Clicking an existing note selects it and it sounds right away. Clicking it again clears the selection.',
            'help.note4': 'Delete removes the selected note or rest.',
            'help.note5': 'Repeats are set with the buttons in the Repeats section: the part between them is played twice.',
            'help.durTitle': 'Duration and dots',
            'help.dur1': 'Buttons from left to right: whole, half, quarter, eighth, sixteenth.',
            'help.dur2': 'Dots are added with separate buttons: one, two or three. One dot makes the note one and a half times longer, two gives 1.75, three gives 1.875.',
            'help.dur3': 'A new note takes the duration of the previous one. A quarter note stays only for the first note of the melody.',
            'help.dur4': 'Alt with the up and down arrows makes the selected note longer or shorter and keeps its dots.',
            'help.editTitle': 'Selection and editing',
            'help.edit1': 'The left and right arrows move between notes, and every selected note sounds.',
            'help.edit2': 'Shift with the up and down arrows changes the pitch of the selected note by a semitone.',
            'help.edit3': 'Undo is Ctrl+Z, redo is Ctrl+Y or Ctrl+Shift+Z. The last 50 actions are kept.',
            'help.edit4': 'The time signature is chosen from the list: 4/4, 3/4, 2/4 or 6/8.',
            'help.edit5': 'Bar lines can be placed by hand or left to the app — the switch sits next to the time signature.',
            'help.playTitle': 'Playback',
            'help.play1': 'The Play and Stop buttons, and the space bar on a computer. When there are no notes, the app prompts you to add some.',
            'help.play2': 'The tempo is set in beats per minute in the field next to the buttons.',
            'help.play3': 'When a note is selected, playback starts from it instead of the beginning of the melody.',
            'help.play4': 'Loop plays the melody over and over with a short pause between rounds.',
            'help.play5': 'The metronome ticks the beats at the current tempo: the checkbox turns it on, the slider sets its volume. The downbeat is higher and louder and does not change the melody volume.',
            'help.play6': 'The 3-2-1 count-in shows three seconds before the start: large translucent digits in the middle of the screen. With the metronome on, the count is accompanied by ticks.',
            'help.trTitle': 'Transposition',
            'help.tr1': 'The All up and All down buttons shift the whole melody by one semitone per press.',
            'help.tr2': 'Accidentals are recalculated, and the choice of sharps or flats is set in the settings.',
            'help.tr3': 'Instruments are presets: soprano -2, alto -9, tenor -14, baritone -21, guitar -12, piano 0. A click sets the fine tuning values, and the matching preset is highlighted in green.',
            'help.tr4': 'Fine tuning holds two shifts — the app sound and the instrument sound — plus the Show written notes checkbox. Checked, it labels the notes as in saxophone sheet music; unchecked, as they sound. Fingerings do not depend on it: the app always shows the one that produces this sound on the instrument, which is how a comfortable variant is found.',
            'help.filesTitle': 'Files and MIDI',
            'help.file1': 'Save melody writes a .json file holding both the notes and the settings. Open melody reads such a file back.',
            'help.file2': 'MIDI import parses a .mid file and places its notes on the staff.',
            'help.file3': 'MIDI export saves the melody as .mid for another program.',
            'help.file4': 'The melody is saved in the browser automatically and restored the next time you open the page.',
            'help.file5': 'The save button stays disabled while the melody has no notes.',
            'help.setTitle': 'Settings',
            'help.set1': 'Language — Russian or English, the switch is in the header.',
            'help.set2': 'Note names under the signs can be shown or hidden.',
            'help.set3': 'Accidentals: sharps or flats. Switching rewrites the notes already added.',
            'help.set4': 'The size of the fingering images is from 50 to 200 pixels.',
            'help.set5': 'The image cache speeds up loading: next to it you can see how many fingerings are stored.',
            'help.mobTitle': 'On a tablet',
            'help.mob1': 'Notes are added by tapping the last bar.',
            'help.mob2': 'The left panel scrolls: the lower settings need scrolling down.',
            'help.mob3': 'A selected note opens a panel with durations, so they can be changed right at the note.',
            'help.keysTitle': 'Keyboard shortcuts on a computer',
            'help.keyPlay': 'play and stop',
            'help.keyMove': 'move between notes',
            'help.keyPitch': 'raise or lower the note by a semitone',
            'help.keyDuration': 'make the duration longer or shorter',
            'help.keyDelete': 'delete the selected note or rest',
            'help.keyInsertNote': 'insert a note before the selected one',
            'help.keyInsertRest': 'insert a rest before the selected one',
            'help.keyUndo': 'undo the last action',
            'help.keyRedo': 'redo the last action',
            'help.goalTitle': 'About comfortable fingerings',
            'help.goal1': 'One of the first goals of the app was to make transposition on an electronic saxophone convenient: the author plays a YDS-120 and worked the fingerings out exactly this way.',
            'help.goal2': 'The recipe is simple. Choose Guitar or Piano and write the melody in the standard tuning, the way it should sound. Then move the Instrument sound shift in the fine tuning: the fingerings change with the value until the most comfortable one shows up.',
            'help.goal3': 'The value you settle on goes into your user preset on the instrument, in the Transpose field. After that the same melody is played with the keys that suit you.',
'about.title': 'About',
            'about.close': 'Close',
            'about.p1': 'Saxophone Fingering Assistant is a handy tool for anyone learning the saxophone.',
            'about.p2': 'It helps you work out fingerings: you enter a melody on the staff and see right under each note how to place your fingers. If a note can be played in several ways, you can choose the convenient one.',
            'about.p3': 'Besides fingerings, the app helps you transpose a melody quickly, write down rhythm (note values and rests), add repeats and listen to the melody you have entered.',
            'about.p4': 'You can switch on looping and practise the melody at the tempo you need.',
            'about.p5': 'Everything runs right in the browser. You can save a melody to your device, load it back later and carry on working with it.',
            'about.p6': 'You can also load a monophonic MIDI file.',
            'about.p7': 'The author is learning to play the electronic saxophone YDS-120 and built this tool for himself — to learn faster.',
            'about.p8': 'Good luck with your music!',
            'about.contact': 'Contact',
            'about.contactShow': 'show the address'
        }
    };

    var current = DEFAULT_LANG;
    var cookieSupport = null;

    function hasDocument() {
        return typeof document !== 'undefined';
    }

    // Куки под file:// браузер не принимает, поэтому проверяем это один раз
    function cookiesWork() {
        if (cookieSupport !== null) return cookieSupport;
        if (!hasDocument()) { cookieSupport = false; return cookieSupport; }

        try {
            document.cookie = 'saxophone_probe=1; path=/';
            cookieSupport = document.cookie.indexOf('saxophone_probe=1') !== -1;
            document.cookie = 'saxophone_probe=; max-age=0; path=/';
        } catch (e) {
            cookieSupport = false;
        }
        return cookieSupport;
    }

    function readCookie(name) {
        if (!hasDocument()) return null;
        var parts = document.cookie ? document.cookie.split('; ') : [];
        for (var i = 0; i < parts.length; i++) {
            var pair = parts[i].split('=');
            if (pair[0] === name) return decodeURIComponent(pair.slice(1).join('='));
        }
        return null;
    }

    function writeCookie(name, value) {
        if (!hasDocument()) return false;
        try {
            document.cookie = name + '=' + encodeURIComponent(value) + '; max-age=31536000; path=/; SameSite=Lax';
            return readCookie(name) === value;
        } catch (e) {
            return false;
        }
    }

    function storageGet(name) {
        if (cookiesWork()) {
            var fromCookie = readCookie(name);
            if (fromCookie) return fromCookie;
        }
        try {
            return localStorage.getItem(LS_PREFIX + name);
        } catch (e) {
            return null;
        }
    }

    function storageSet(name, value) {
        var saved = false;
        if (cookiesWork() && writeCookie(name, value)) saved = true;
        try {
            localStorage.setItem(LS_PREFIX + name, value);
            saved = true;
        } catch (e) { /* хранилище недоступно */ }
        return saved;
    }

    function detectLang() {
        var saved = storageGet('lang');
        if (saved && DICT[saved]) return saved;

        var candidates = [];
        if (typeof navigator !== 'undefined') {
            if (navigator.languages && navigator.languages.length) {
                candidates = candidates.concat(navigator.languages);
            }
            if (navigator.language) candidates.push(navigator.language);
        }

        for (var i = 0; i < candidates.length; i++) {
            var code = String(candidates[i]).toLowerCase();
            for (var j = 0; j < LANGS.length; j++) {
                if (code.indexOf(LANGS[j]) === 0) return LANGS[j];
            }
        }
        return DEFAULT_LANG;
    }

    function t(key, params) {
        var table = DICT[current] || DICT[DEFAULT_LANG];
        var text = table[key];
        if (text === undefined) text = DICT[DEFAULT_LANG][key];
        if (text === undefined) return key;

        if (params) {
            Object.keys(params).forEach(function (name) {
                text = text.split('{' + name + '}').join(String(params[name]));
            });
        }
        return text;
    }

    // Форма слова по числу: в русском их три, в английском две
    var PLURAL_RULES = {
        ru: function (n) {
            var mod10 = n % 10;
            var mod100 = n % 100;
            if (mod10 === 1 && mod100 !== 11) return 'one';
            if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 'few';
            return 'many';
        },
        en: function (n) {
            return n === 1 ? 'one' : 'other';
        }
    };

    function plural(key, n, params) {
        var rule = PLURAL_RULES[current] || PLURAL_RULES[DEFAULT_LANG];
        var merged = {};
        if (params) {
            Object.keys(params).forEach(function (name) { merged[name] = params[name]; });
        }
        merged.n = n;

        var form = rule(n);
        var text = t(key + '.' + form, merged);
        if (text === key + '.' + form) text = t(key + '.many', merged);
        return text;
    }

    // Подставляет переводы в разметку по атрибутам data-i18n и data-i18n-title
    function apply(scope) {
        if (!hasDocument()) return;

        var rootNode = scope || document;
        var nodes = rootNode.querySelectorAll('[data-i18n]');
        for (var i = 0; i < nodes.length; i++) {
            nodes[i].textContent = t(nodes[i].getAttribute('data-i18n'));
        }

        var titled = rootNode.querySelectorAll('[data-i18n-title]');
        for (var k = 0; k < titled.length; k++) {
            titled[k].setAttribute('title', t(titled[k].getAttribute('data-i18n-title')));
        }

        if (document.documentElement) document.documentElement.lang = current;
    }

    function getLang() {
        return current;
    }

    function setLang(lang, persist) {
        if (!DICT[lang]) return current;

        current = lang;
        if (persist !== false) storageSet('lang', lang);
        apply();

        if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function' &&
            typeof window.CustomEvent === 'function') {
            window.dispatchEvent(new window.CustomEvent('applanguagechange', { detail: { lang: lang } }));
        }
        return current;
    }

    function consentGiven() {
        return storageGet('consent') === 'yes';
    }

    function giveConsent() {
        storageSet('consent', 'yes');
    }

    return {
        LANGS: LANGS,
        DEFAULT_LANG: DEFAULT_LANG,
        dict: DICT,
        t: t,
        plural: plural,
        apply: apply,
        detectLang: detectLang,
        getLang: getLang,
        setLang: setLang,
        storageGet: storageGet,
        storageSet: storageSet,
        cookiesWork: cookiesWork,
        consentGiven: consentGiven,
        giveConsent: giveConsent
    };
}));