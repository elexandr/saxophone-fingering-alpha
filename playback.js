// Saxophone Fingering Assistant - воспроизведение мелодии
// Звук синтезируется через Web Audio API: без внешних библиотек и без файлов сэмплов.
// Расчёт длительностей и частот вынесен в чистые функции, пригодные для проверки в Node.

(function (root, factory) {
    var api = factory();
    if (typeof module === 'object' && module.exports) {
        module.exports = api;
    } else {
        root.Playback = api;
    }
}(typeof window !== 'undefined' ? window : this, function () {
    'use strict';

    var NOTE_RE = /^([A-Ga-g])([#b]?)(-?\d+)$/;
    var SEMITONE = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

    // 'C#4' / 'Db4' -> частота в герцах. A4 = 440 Гц.
    // semitones - сдвиг инструмента: 0 даёт записанную ноту, -12 звучит на октаву ниже
    // Сдвиг имени ноты на полутоны: C4 при -12 даёт C3.
    // Нужен для аппликатуры: сдвиг инструмента меняет набор клавиш
    function transposeNoteName(name, semitones) {
        var m = NOTE_RE.exec(String(name == null ? '' : name).trim());
        if (!m) return name;

        var base = SEMITONE[m[1].toUpperCase()];
        var accidental = m[2] === '#' ? 1 : (m[2] === 'b' ? -1 : 0);
        var midi = (parseInt(m[3], 10) + 1) * 12 + base + accidental + (Number(semitones) || 0);
        var names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

        return names[((midi % 12) + 12) % 12] + (Math.floor(midi / 12) - 1);
    }
    function noteToFrequency(name, semitones) {
        var m = NOTE_RE.exec(String(name == null ? '' : name).trim());
        if (!m) return null;
        var base = SEMITONE[m[1].toUpperCase()];
        var accidental = m[2] === '#' ? 1 : (m[2] === 'b' ? -1 : 0);
        var midi = (parseInt(m[3], 10) + 1) * 12 + base + accidental + (Number(semitones) || 0);
        return 440 * Math.pow(2, (midi - 69) / 12);
    }

    // Длительность элемента в долях (четвертях). duration - знаменатель, dotted - точка.
    // Число точек у ноты. Булево значение из старых файлов считается одной точкой
    function dotCount(value) {
        if (value === true) return 1;
        var count = Number(value);
        if (!count || count < 0) return 0;
        return Math.min(3, Math.floor(count));
    }

    // tuplet - отношение группы: { actual: 3, normal: 2 } значит три ноты
    // в времени двух. Без него длительность считается как обычно
    function beatsFor(duration, dotted, tuplet) {
        var denominator = duration || 4;
        var beats = 4 / denominator;

        // Каждая следующая точка добавляет половину предыдущей добавки:
        // одна - 1.5 длительности, две - 1.75, три - 1.875
        var factor = 1;
        var part = 0.5;
        var dots = dotCount(dotted);
        for (var i = 0; i < dots; i++) {
            factor += part;
            part = part / 2;
        }

        beats = beats * factor;

        if (tuplet && tuplet.actual && tuplet.normal) {
            beats = beats * (Number(tuplet.normal) / Number(tuplet.actual));
        }

        return beats;
    }

    // Длительность элемента в долях с учётом точного времени из файла.
    // В MusicXML <type> бывает приблизительным (так пишут конвертеры из MIDI),
    // а настоящее время лежит в <duration>; разбор кладёт его в поле beats.
    // Если верить одному <type>, мелодия уезжает относительно сопровождения
    function beatsOf(element) {
        if (element && typeof element.beats === 'number' && element.beats > 0) return element.beats;
        return beatsFor(element && element.duration, element && element.dotted, element && element.tuplet);
    }

    // Длительность элемента в секундах при заданном темпе.
    function secondsFor(element, tempo) {
        var bpm = tempo > 0 ? tempo : 80;
        return beatsOf(element) * (60 / bpm);
    }

    function totalSeconds(elements, tempo) {
        var sum = 0;
        for (var i = 0; i < (elements || []).length; i++) {
            sum += secondsFor(elements[i], tempo);
        }
        return sum;
    }

    // --- реприза ---

    // Пары «начало - конец» репризы.
    // Участки идут последовательно и не вкладываются друг в друга: вложенное
    // начало игнорируется. Закрывающий знак без открывающего означает повтор
    // с начала мелодии - так это читается и в нотной записи.
    function computeRepeatPairs(elements) {
        var list = elements || [];
        var pairs = [];
        var openStart = -1;

        for (var i = 0; i < list.length; i++) {
            var element = list[i];

            // Начало и конец на одном элементе - участок из одного элемента
            if (element.repeatStart && element.repeatEnd && openStart === -1) {
                pairs.push({ start: i, end: i, fromStart: false });
                continue;
            }

            if (element.repeatEnd) {
                var fromStart = openStart === -1;
                pairs.push({
                    start: fromStart ? 0 : openStart,
                    end: i,
                    fromStart: fromStart
                });
                openStart = -1;
                continue;
            }

            if (element.repeatStart && openStart === -1) {
                openStart = i;
            }
        }

        return pairs;
    }

    // Порядок индексов для воспроизведения: участок репризы играется дважды.
    function buildPlaybackOrder(elements) {
        var list = elements || [];
        var pairs = computeRepeatPairs(list);
        var repeatFrom = {};

        pairs.forEach(function (pair) {
            repeatFrom[pair.end] = pair.start;
        });

        var order = [];
        var used = {};
        var index = 0;
        var guard = list.length * 6 + 64; // страховка от зацикливания

        while (index < list.length && guard-- > 0) {
            order.push(index);

            if (Object.prototype.hasOwnProperty.call(repeatFrom, index) && !used[index]) {
                used[index] = true;
                index = repeatFrom[index];
                continue;
            }

            index++;
        }

        return order;
    }

    // Готовая последовательность элементов для проигрывателя
    function buildSequence(elements) {
        var list = elements || [];
        return buildPlaybackOrder(list).map(function (index) {
            return list[index];
        });
    }

    function audioSupported() {
        return typeof window !== 'undefined' && !!(window.AudioContext || window.webkitAudioContext);
    }

    // Кадр отрисовки: в браузере requestAnimationFrame, в Node - таймер
    function requestFrame(callback) {
        if (typeof requestAnimationFrame === 'function') return requestAnimationFrame(callback);
        return setTimeout(callback, 16);
    }

    function MelodyPlayer() {
        this.ctx = null;
        this.master = null;
        this.voices = [];
        this.timers = [];
        this.playing = false;
    this.frame = null;
    this.transpose = 0; // сдвиг инструмента в полутонах
    this.timeline = [];
    }

    MelodyPlayer.prototype.ensureContext = function () {
        if (this.ctx) return this.ctx;
        if (!audioSupported()) return null;
        var Ctor = window.AudioContext || window.webkitAudioContext;

        // interactive просит маленький буфер: чем меньше задержка вывода,
        // тем ближе подсветка к тому, что слышно
        try {
            this.ctx = new Ctor({ latencyHint: 'interactive' });
        } catch (error) {
            this.ctx = new Ctor();
        }
        this.master = this.ctx.createGain();
        this.master.gain.value = 0.45;

        // Метроном идёт через свою громкость: его можно приглушить,
        // не трогая громкость самой мелодии
        this.metronomeGain = this.ctx.createGain();
        this.metronomeGain.gain.value = 0.6;
        this.metronomeGain.connect(this.master);
        this.master.connect(this.ctx.destination);
        return this.ctx;
    };

    // Одна нота: две расстроенные пилы через фильтр, огибающая и вибрато.
    MelodyPlayer.prototype.scheduleNote = function (frequency, startAt, durationSec, destination) {
        var ctx = this.ctx;
        var attack = 0.025;
        var release = 0.09;
        var end = startAt + durationSec;
        var peak = 0.3;

        var osc1 = ctx.createOscillator();
        var osc2 = ctx.createOscillator();
        osc1.type = 'sawtooth';
        osc2.type = 'triangle';
        osc1.frequency.value = frequency;
        osc2.frequency.value = frequency * 1.006;

        var filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = Math.min(7000, frequency * 6);
        filter.Q.value = 2.5;

        var gain = ctx.createGain();
        gain.gain.setValueAtTime(0.0001, startAt);
        gain.gain.exponentialRampToValueAtTime(peak, startAt + attack);
        gain.gain.exponentialRampToValueAtTime(peak * 0.72, startAt + attack + 0.06);
        gain.gain.setTargetAtTime(0.0001, Math.max(startAt + attack + 0.07, end - release), 0.035);

        var lfo = ctx.createOscillator();
        lfo.type = 'sine';
        lfo.frequency.value = 5.2;
        var lfoGain = ctx.createGain();
        lfoGain.gain.value = frequency * 0.005;
        lfo.connect(lfoGain);
        lfoGain.connect(osc1.frequency);
        lfoGain.connect(osc2.frequency);

        osc1.connect(filter);
        osc2.connect(filter);
        filter.connect(gain);
        gain.connect(destination || this.master);

        var stopAt = end + 0.2;
        osc1.start(startAt);
        osc2.start(startAt);
        lfo.start(startAt);
        osc1.stop(stopAt);
        osc2.stop(stopAt);
        lfo.stop(stopAt);

        var voices = [osc1, osc2, lfo];
        this.voices.push.apply(this.voices, voices);

        // Возвращаем голоса: вызывающий может погасить звук раньше срока
        return voices;
    };

    // elements: [{ noteName, duration, dotted, isRest }], handlers: { onElement, onEnd, onUnsupported }
    // options: { leadIn, tailMs } - пауза перед началом и после конца в секундах и миллисекундах.
    // Для повтора по кругу их задают нулевыми, чтобы круг начинался без разрыва.
    // Сколько времени проходит от планирования звука до его звучания.
    // Chrome отдаёт baseLatency и outputLatency; если их нет - считаем ноль.
    MelodyPlayer.prototype.outputLag = function () {
        if (!this.ctx) return 0;
        var base = typeof this.ctx.baseLatency === 'number' ? this.ctx.baseLatency : 0;
        var output = typeof this.ctx.outputLatency === 'number' ? this.ctx.outputLatency : 0;
        return base + output;
    };
    // Щелчок метронома: короткий тик, у сильной доли выше и громче
    MelodyPlayer.prototype.scheduleClick = function (startAt, accent, destination) {
        var ctx = this.ctx;
        if (!ctx) return;

        var osc = ctx.createOscillator();
        var gain = ctx.createGain();

        osc.type = 'square';
        osc.frequency.value = accent ? 1600 : 1000;

        var peak = accent ? 0.35 : 0.2;
        gain.gain.setValueAtTime(0.0001, startAt);
        gain.gain.exponentialRampToValueAtTime(peak, startAt + 0.002);
        gain.gain.exponentialRampToValueAtTime(0.0001, startAt + 0.05);

        osc.connect(gain);
        gain.connect(destination || this.metronomeGain || this.master);

        osc.start(startAt);
        osc.stop(startAt + 0.08);
        this.voices.push(osc);
    };

    // Громкость метронома: 0..1
    MelodyPlayer.prototype.setMetronomeVolume = function (value) {
        if (this.metronomeGain) {
            this.metronomeGain.gain.value = Math.max(0, Math.min(1, value));
        }
    };

    // Щелчки отсчёта перед началом: последний - как затакт к сильной доле
    MelodyPlayer.prototype.countInClicks = function (count, secondsEach) {
        var ctx = this.ensureContext();
        if (!ctx) return;

        if (ctx.state === 'suspended' && ctx.resume) ctx.resume();

        var step = secondsEach > 0 ? secondsEach : 1;
        var start = ctx.currentTime + 0.05;

        for (var i = 0; i < count; i++) {
            this.scheduleClick(start + i * step, i === count - 1);
        }
    };

    // Сдвиг инструмента: ноты и аппликатуры не меняются, меняется только звук
    MelodyPlayer.prototype.setTranspose = function (semitones) {
        this.transpose = Number(semitones) || 0;
    };

    // Отдельный сдвиг сопровождения. Складывается с общим: общий сдвиг
    // двигает всю пьесу вместе с сопровождением, а этот - только его
    MelodyPlayer.prototype.setAccompanimentTranspose = function (semitones) {
        this.accompanimentTranspose = Number(semitones) || 0;
    };

    MelodyPlayer.prototype.play = function (elements, tempo, handlers, options) {
        handlers = handlers || {};
        options = options || {};
        this.stop();

        var ctx = this.ensureContext();
        if (!ctx) {
            if (handlers.onUnsupported) handlers.onUnsupported();
            return false;
        }
        if (ctx.state === 'suspended' && ctx.resume) ctx.resume();

        var self = this;
        var leadIn = options.leadIn === undefined ? 0.15 : options.leadIn;
        var tailMs = options.tailMs === undefined ? 120 : options.tailMs;
        var cursor = ctx.currentTime + leadIn;
        var list = elements || [];

        // Запоминаем, что и как играем: понадобится для перепланирования на лету
        this.lastPlay = { elements: list, tempo: tempo, handlers: handlers, options: options };

        this.playing = true;

        // Расписание: что когда звучит. Подсветку ведём по тем же временам,
        // но по звуковым часам, а не по setTimeout
        var timeline = [];

        // Связанные лигой ноты звучат одним протянутым звуком: вторую не
        // ударяем, а продлеваем первую. Цепочка из трёх и более тоже
        var plan = list.map(function (element) {
            return { element: element, seconds: secondsFor(element, tempo), skip: false, head: null };
        });

        for (var p = 0; p + 1 < plan.length; p++) {
            var head = plan[p];
            var tail = plan[p + 1];
            if (!head.element.tiedToNext || head.element.isRest || tail.element.isRest) continue;
            if (head.element.noteName !== tail.element.noteName) continue;

            var voice = head.skip && head.head ? head.head : head;
            voice.seconds += tail.seconds;
            tail.skip = true;
            tail.head = voice;
        }

        // Фразировочная лига: где она открыта, ноты переходят одна в другую
        // без разрыва. Последняя нота лиги закрывается обычным образом
        var slurOpen = false;
        var slurJoined = plan.map(function (item) {
            if (item.element.slurStart) slurOpen = true;
            var joined = slurOpen && !item.element.slurEnd;
            if (item.element.slurEnd) slurOpen = false;
            return joined;
        });

        // Аккомпанемент: ноты сопровождения играются по абсолютному времени.
        // Он написан в концертной высоте, поэтому сдвиг инструмента к нему
        // не применяется
        var startCursor = cursor;
        var secondsPerBeat = 60 / (tempo > 0 ? tempo : 80);

        // Сопровождение планируем ПОРЦИЯМИ, по две секунды вперёд.
        // Если запланировать все ноты сразу (в файле их бывает больше трёх
        // тысяч), звуковая система браузера не справляется и замолкает
        // весь звук - и мелодия тоже
        var accNotes = (options.accompaniment || []).slice().sort(function (a, b) {
            return (a.startBeat || 0) - (b.startBeat || 0);
        });
        var accIndex = 0;
        // Если играем с выбранной ноты, сопровождение должно начаться с того же
        // места. Его времена абсолютные от начала пьесы, поэтому вычитаем сдвиг
        var accFromBeat = Number(options.accompanimentFromBeat) || 0;

        // Общая громкость сопровождения и отдельная на каждую дорожку.
        // Это узлы усиления: сколько бы дорожек ни было, нагрузка копеечная
        var accMasterGain = ctx.createGain();
        this.accompanimentVolume = options.accompanimentVolume === undefined
            ? 1 : Number(options.accompanimentVolume);
        this.accompanimentMuted = !!options.muteAccompaniment;
        accMasterGain.gain.value = this.accompanimentMuted ? 0 : this.accompanimentVolume;
        accMasterGain.connect(this.master);
        this.accompanimentBus = { master: accMasterGain, tracks: {} };

        // Основная линия тоже через свой узел: тогда галочку «звук основной»
        // можно переключать во время игры. Раньше при снятой галочке ноты
        // не ставились вовсе, и включить её в середине пьесы было нечем
        this.mainMuted = !!options.muteMain;
        this.melodyBus = ctx.createGain();
        this.melodyBus.gain.value = this.mainMuted ? 0 : 1;
        this.melodyBus.connect(this.master);

        function trackBus(trackIndex, trackName) {
            var key = String(trackIndex === undefined || trackIndex === null ? trackName || '0' : trackIndex);
            var existing = self.accompanimentBus.tracks[key];
            if (existing) return existing;

            var settings = (options.accompanimentTracks || {})[key] || {};
            var node = ctx.createGain();
            var bus = {
                key: key,
                name: trackName || key,
                gain: node,
                volume: settings.volume === undefined ? 1 : Number(settings.volume),
                muted: !!settings.muted
            };
            bus.gain.gain.value = bus.muted ? 0 : bus.volume;
            node.connect(accMasterGain);
            self.accompanimentBus.tracks[key] = bus;
            return bus;
        }

        function scheduleAccompanimentPortion() {
            // После остановки не досылаем: иначе сопровождение звучит ещё
            // полсекунды-секунду после конца, «догоняя» остановленную игру
            if (!self.playing) return;

            // Галочка «звук сопровождения» глушит громкость, а не пропускает
            // ноты. Пропущенные ноты терялись навсегда: снял галочку - тишина,
            // поставил обратно - и включать уже нечего
            if (typeof document !== 'undefined') {
                var checkbox = document.getElementById('sound-accompaniment');
                if (checkbox) self.setAccompanimentMuted(!checkbox.checked);
            }

            var horizon = ctx.currentTime + 2.0;
            while (accIndex < accNotes.length) {
                var note = accNotes[accIndex];
                var noteBeat = (note.startBeat || 0);
                // Ноты до места старта пропускаем
                if (noteBeat + (note.beats || 0) <= accFromBeat) {
                    accIndex++;
                    continue;
                }
                var startAt = startCursor + (noteBeat - accFromBeat) * secondsPerBeat;
                if (startAt > horizon) break;
                accIndex++;

                // Ударные: своего барабанного звука нет, играем щелчками.
                // Бочка и малый - с ударением, тарелки - коротко.
                // Заглушённая дорожка не пропускается, а идёт с нулевой
                // громкостью: иначе снятая и возвращённая галочка теряла ноты
                var bus = trackBus(note.trackIndex, note.trackName);

                if (note.drum) {
                    var kind = Number(note.midi) || 0;
                    var accent = (kind === 35 || kind === 36 || kind === 38 || kind === 40);
                    self.scheduleClick(startAt, accent, bus.gain);
                    continue;
                }

                // Сдвиг сопровождения. Сдвиг инструмента к нему НЕ применяется:
                // сопровождение двигается только кнопками «Все вверх» и «Все вниз»
                // и полем «Сдвиг сопровождения»
                var shift = self.accompanimentTranspose || 0;
                var frequency = 440 * Math.pow(2, (note.midi + shift - 69) / 12);
                self.scheduleNote(frequency, startAt, (note.beats || 1) * secondsPerBeat * 0.98, bus.gain);
            }
            if (accIndex < accNotes.length) {
                // Таймер кладём в общий список: stop() его очистит
                self.accompanimentTimer = setTimeout(scheduleAccompanimentPortion, 500);
                self.timers.push(self.accompanimentTimer);
            }
        }

        // Сопровождение ставим всегда, а слышно его или нет - решает громкость.
        // Раньше при снятой галочке планировщик не запускался совсем, и
        // поставленная обратно галочка ничего не включала
        if (accNotes.length) {
            scheduleAccompanimentPortion();
        }

        // Расписание строим целиком сразу: это только числа, дешево. А звук
        // ставим порциями, как и сопровождение: у длинной пьесы нот бывает
        // под тысячу, и постановка всех сразу занимает главный поток на
        // сотни миллисекунд - замерено 378 мс на 195 нотах
        plan.forEach(function (item, index) {
            var element = item.element;
            timeline.push({
                index: index,
                element: element,
                startAt: cursor,
                seconds: item.seconds,
                // Связанная нота продолжает звук предыдущей: её не ударяем
                skip: item.skip,
                // Под лигой нота звучит всю длительность, без разрыва
                joined: slurJoined[index] || (slurJoined[index - 1] && !element.slurEnd && index > 0)
            });
            // Время идёт по исходным длительностям: лига меняет звук, не такт
            cursor += secondsFor(element, tempo);
        });

        var melodyIndex = 0;

        // Метроном тоже ставим порциями: щелчков на всю пьесу бывает под четыре
        // сотни, и разом они занимали главный поток сильнее, чем ноты
        var beatSeconds = 60 / (tempo > 0 ? tempo : 80);
        var beatsPerBar = options.beatsPerBar > 0 ? options.beatsPerBar : 4;
        var metronomeOn = !!options.metronome;
        var metronomeStart = ctx.currentTime + leadIn;
        var metronomeTotal = metronomeOn ? Math.round((cursor - metronomeStart) / beatSeconds) : -1;
        var metronomeBeat = 0;

        function scheduleMelodyPortion() {
            if (!self.playing) return;
            var horizon = ctx.currentTime + 2.0;

            while (melodyIndex < timeline.length) {
                var step = timeline[melodyIndex];
                if (step.startAt > horizon) break;
                melodyIndex++;

                // Основную линию можно выключить: подсветка при этом работает,
                // потому что она идёт по времени, а не по звуку
                if (step.skip || step.element.isRest) continue;
                var frequency = noteToFrequency(step.element.noteName, self.transpose);
                if (!frequency) continue;
                self.scheduleNote(frequency, step.startAt,
                    step.seconds * (step.joined ? 1 : 0.92), self.melodyBus);
            }

            if (metronomeOn) {
                while (metronomeBeat <= metronomeTotal) {
                    var clickAt = metronomeStart + metronomeBeat * beatSeconds;
                    if (clickAt > horizon) break;
                    self.scheduleClick(clickAt, metronomeBeat % beatsPerBar === 0);
                    metronomeBeat++;
                }
            }

            var melodyLeft = melodyIndex < timeline.length;
            var metronomeLeft = metronomeOn && metronomeBeat <= metronomeTotal;
            if (melodyLeft || metronomeLeft) {
                self.timers.push(setTimeout(scheduleMelodyPortion, 500));
            }
        }

        scheduleMelodyPortion();

        this.timeline = timeline;
        this.timelineIndex = 0;
        this.endsAt = cursor + tailMs / 1000;

        // Смотрим на звуковые часы в каждом кадре: тогда подсветка отстаёт от
        // звука не больше чем на кадр, и её не сдвигает работа главного потока
        var tick = function () {
            if (!self.playing) return;

            var now = self.ctx ? self.ctx.currentTime : 0;

            // Поправку на задержку вывода не применяем: наблюдение на планшете
            // показало отставание подсветки, а не спешку. Причина отставания -
            // занятый главный поток, и лечится она разгрузкой кадра
            var heard = now;

            while (self.timelineIndex < timeline.length &&
                   timeline[self.timelineIndex].startAt <= heard) {
                var step = timeline[self.timelineIndex];
                self.timelineIndex++;
                if (handlers.onElement) handlers.onElement(step.index, step.element);
            }

            if (heard >= self.endsAt) {
                self.playing = false;
                self.frame = null;
                if (handlers.onEnd) handlers.onEnd();
                return;
            }

            self.frame = requestFrame(tick);
        };

        this.frame = requestFrame(tick);

        return true;
    };

    // Перепланировать остаток мелодии с новым сдвигом: звук меняется на лету.
    // Текущая нота обрывается - это осознанная плата за смену звука во время игры
    MelodyPlayer.prototype.replan = function (semitones) {
        if (!this.playing || !this.lastPlay) return false;

        // Сдвиг запоминаем в любом случае: иначе состояние плеера разойдётся
        // с настройками, и следующая смена снова вызовет перепланирование
        this.setTranspose(semitones);

        var rest = this.lastPlay.elements.slice(this.timelineIndex || 0);
        if (!rest.length) return false;

        var tempo = this.lastPlay.tempo;
        var handlers = this.lastPlay.handlers;
        // Галочки звука могли переключить во время игры: переносим их текущее
        // состояние, иначе перепланирование вернуло бы старое
        var options = Object.assign({}, this.lastPlay.options, {
            muteMain: !!this.mainMuted,
            muteAccompaniment: !!this.accompanimentMuted
        });
        this.play(rest, tempo, handlers, options);

        return true;
    };

    // Громкость сопровождения целиком и по дорожкам. Действует сразу,
    // в том числе во время игры: меняются значения узлов, ноты не трогаются
    MelodyPlayer.prototype.applyAccompanimentGain = function () {
        if (!this.accompanimentBus || !this.accompanimentBus.master) return;
        var volume = this.accompanimentVolume === undefined ? 1 : Number(this.accompanimentVolume) || 0;
        this.accompanimentBus.master.gain.value = this.accompanimentMuted ? 0 : volume;
    };

    MelodyPlayer.prototype.setAccompanimentVolume = function (value) {
        this.accompanimentVolume = Math.max(0, Math.min(1, Number(value) || 0));
        this.applyAccompanimentGain();
    };

    // Галочка «звук сопровождения». Именно громкость, а не пропуск нот:
    // тогда включить обратно можно в любой момент и ничего не теряется
    MelodyPlayer.prototype.setAccompanimentMuted = function (muted) {
        this.accompanimentMuted = !!muted;
        this.applyAccompanimentGain();
    };

    // Галочка «звук основной линии»
    MelodyPlayer.prototype.setMainMuted = function (muted) {
        this.mainMuted = !!muted;
        if (this.melodyBus) this.melodyBus.gain.value = this.mainMuted ? 0 : 1;
    };

    MelodyPlayer.prototype.applyTrackGain = function (bus) {
        if (!bus || !bus.gain) return;
        var volume = bus.volume === undefined ? 1 : Number(bus.volume) || 0;
        bus.gain.gain.value = bus.muted ? 0 : volume;
    };

    MelodyPlayer.prototype.setTrackVolume = function (trackKey, value) {
        if (!this.accompanimentBus) return;
        var bus = this.accompanimentBus.tracks[String(trackKey)];
        if (!bus) return;
        bus.volume = Math.max(0, Math.min(1, Number(value) || 0));
        this.applyTrackGain(bus);
    };

    MelodyPlayer.prototype.setTrackMuted = function (trackKey, muted) {
        if (!this.accompanimentBus) return;
        var bus = this.accompanimentBus.tracks[String(trackKey)];
        if (!bus) return;
        bus.muted = !!muted;
        this.applyTrackGain(bus);
    };

    MelodyPlayer.prototype.stop = function () {
        // Кадр подсветки тоже снимаем: иначе он продолжит тикать
        if (this.frame !== null && this.frame !== undefined) {
            if (typeof cancelAnimationFrame === 'function') cancelAnimationFrame(this.frame);
            clearTimeout(this.frame);
            this.frame = null;
        }
        this.timers.forEach(function (id) { clearTimeout(id); });
        this.timers = [];

        this.voices.forEach(function (voice) {
            try { voice.stop(); } catch (e) { /* уже остановлен */ }
            try { voice.disconnect(); } catch (e) { /* уже отключён */ }
        });
        this.voices = [];
        this.accompanimentBus = null;
        this.melodyBus = null;
        this.playing = false;
    };

    function createPlayer() {
        return new MelodyPlayer();
    }

    return {
        noteToFrequency: noteToFrequency,
        transposeNoteName: transposeNoteName,
        dotCount: dotCount,
        beatsFor: beatsFor,
        beatsOf: beatsOf,
        secondsFor: secondsFor,
        totalSeconds: totalSeconds,
        computeRepeatPairs: computeRepeatPairs,
        buildPlaybackOrder: buildPlaybackOrder,
        buildSequence: buildSequence,
        audioSupported: audioSupported,
        MelodyPlayer: MelodyPlayer,
        createPlayer: createPlayer
    };
}));