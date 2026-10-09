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

    function beatsFor(duration, dotted) {
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

        return beats * factor;
    }

    // Длительность элемента в секундах при заданном темпе.
    function secondsFor(element, tempo) {
        var bpm = tempo > 0 ? tempo : 80;
        return beatsFor(element && element.duration, element && element.dotted) * (60 / bpm);
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
    MelodyPlayer.prototype.scheduleNote = function (frequency, startAt, durationSec) {
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
        gain.connect(this.master);

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
    MelodyPlayer.prototype.scheduleClick = function (startAt, accent) {
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
        gain.connect(this.metronomeGain || this.master);

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

        list.forEach(function (element, index) {
            var durationSec = secondsFor(element, tempo);
            var startAt = cursor;

            if (!element.isRest) {
                var frequency = noteToFrequency(element.noteName, self.transpose);
                if (frequency) {
                    self.scheduleNote(frequency, startAt, durationSec * 0.92);
                }
            }

            timeline.push({ index: index, element: element, startAt: startAt });
            cursor += durationSec;
        });

        // Метроном: щелчок на каждую долю, ударение на сильную
        if (options.metronome) {
            var beatSeconds = 60 / (tempo > 0 ? tempo : 80);
            var beatsPerBar = options.beatsPerBar > 0 ? options.beatsPerBar : 4;
            var startCursor = ctx.currentTime + leadIn;
            var totalBeats = Math.round((cursor - startCursor) / beatSeconds);

            for (var beat = 0; beat <= totalBeats; beat++) {
                self.scheduleClick(startCursor + beat * beatSeconds, beat % beatsPerBar === 0);
            }
        }

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
        var options = this.lastPlay.options;
        this.play(rest, tempo, handlers, options);

        return true;
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