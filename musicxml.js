// Запись мелодии в MusicXML.
//
// Формат обмена: его читают MuseScore, Sibelius, Audiveris и другие.
// Пишем подмножество, которого хватает приложению: ноты, паузы, длительности,
// точки, лиги связующие и фразировочные, триоли и квинтоли, размер и темп.
//
// Своё состояние приложения уходит в штатные точки расширения MusicXML:
// - <miscellaneous-field name="sax-fingering-..."> на уровне файла
// - <other-notation>sax-fingering-variant=N</other-notation> на уровне ноты
//
// Модуль самостоятельный: работает и в браузере, и в Node, без зависимостей.

(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.MusicXml = factory();
    }
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    // Пульсация как в наших MIDI: делится и на 3, и на 5,
    // поэтому триоли и квинтоли записываются целыми числами
    var DIVISIONS = 480;

    var LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
    var TYPE_BY_DENOMINATOR = {
        1: 'whole',
        2: 'half',
        4: 'quarter',
        8: 'eighth',
        16: 'sixteenth',
        32: 'thirty-second'
    };

    // Доли одной ноты: длительность, точки и отношение триоли.
    // Если известенf точное время из файла (поле beats), оно главнее: <type>
    // бывает приблизительным, а <duration> - это настоящее время ноты
    function beatsOf(element) {
        if (element && typeof element.beats === 'number' && element.beats > 0) return element.beats;

        var denominator = Number(element.duration) || 4;
        var beats = 4 / denominator;

        // Каждая точка добавляет половину ПРЕДЫДУЩЕЙ добавки, а не половину
        // уже выросшей длительности: две точки - это 1.75, а не 1.875
        var dots = Number(element.dotted) || 0;
        if (element.dotted === true) dots = 1;
        var part = beats / 2;
        for (var i = 0; i < dots; i++) {
            beats += part;
            part = part / 2;
        }

        var tuplet = element.tuplet;
        if (tuplet && tuplet.actual && tuplet.normal) {
            beats = beats * (Number(tuplet.normal) / Number(tuplet.actual));
        }

        return beats;
    }

    // Имя ноты в вид лада: 'C#4' -> { step: 'C', alter: 1, octave: 4 }
    function pitchOf(name) {
        var match = /^([A-G])(#|b)?(-?\d+)$/.exec(String(name || ''));
        if (!match) return null;

        var alter = 0;
        if (match[2] === '#') alter = 1;
        if (match[2] === 'b') alter = -1;

        return { step: match[1], alter: alter, octave: Number(match[3]) };
    }

    // Высота в полутонах от C0: нужна, чтобы выбрать верхнюю ноту аккорда
    function pitchNumber(name) {
        var pitch = pitchOf(name);
        if (!pitch) return null;
        var steps = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
        return pitch.octave * 12 + (steps[pitch.step] || 0) + pitch.alter;
    }

    function escapeText(value) {
        return String(value === null || value === undefined ? '' : value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function lines(indent, items) {
        return items.map(function (item) { return indent + item; }).join('\n');
    }

    // Группы триолей: подряд идущие элементы с одинаковым отношением.
    // Нужны, чтобы поставить скобку: начало на первой ноте, конец на последней
    function tupletMarks(elements) {
        var marks = elements.map(function () { return null; });

        var index = 0;
        while (index < elements.length) {
            var tuplet = elements[index].tuplet;
            if (!tuplet || !tuplet.actual || !tuplet.normal) {
                index++;
                continue;
            }

            var last = index;
            while (last + 1 < elements.length) {
                var next = elements[last + 1].tuplet;
                if (!next || next.actual !== tuplet.actual || next.normal !== tuplet.normal) break;
                last++;
            }

            marks[index] = 'start';
            marks[last] = last === index ? 'start-stop' : 'stop';
            index = last + 1;
        }

        return marks;
    }

    // Лиги связующие: у нас флажок "связана со следующей", а MusicXML
    // требует пару start и stop
    function tieMarks(elements) {
        var starts = elements.map(function () { return false; });
        var stops = elements.map(function () { return false; });

        for (var i = 0; i < elements.length; i++) {
            var element = elements[i];
            var next = elements[i + 1];
            if (!element.tiedToNext || !next) continue;
            if (element.isRest || next.isRest) continue;
            if (element.noteName !== next.noteName) continue;

            starts[i] = true;
            stops[i + 1] = true;
        }

        return { starts: starts, stops: stops };
    }

    // Фразировочные лиги: у нас метка начала и конца на нотах
    function slurNumbers(elements) {
        var open = elements.map(function () { return 0; });
        var close = elements.map(function () { return 0; });
        var stack = [];
        var counter = 0;

        for (var i = 0; i < elements.length; i++) {
            if (elements[i].isRest) continue;

            if (elements[i].slurStart) {
                counter++;
                stack.push(counter);
                open[i] = counter;
            }
            if (elements[i].slurEnd && stack.length) {
                var number = stack.pop();
                close[i] = number;
                // Если начало и конец на одной ноте, лига вырожденная - не пишем
                if (open[i] === number) { open[i] = 0; close[i] = 0; }
            }
        }

        return { open: open, close: close };
    }

    // Разбиение на такты: по длительностям и размеру, плюс ручные черты
    function measuresOf(elements, beatsPerMeasure) {
        var measures = [];
        var current = [];
        var used = 0;
        var size = beatsPerMeasure > 0 ? beatsPerMeasure : 4;

        elements.forEach(function (element) {
            current.push(element);
            used += beatsOf(element);

            var forceBar = element.hasBarLine || (element.repeatEnd && !element.repeatStart);
            if (element.repeatEnd) forceBar = true;

            if (used >= size - 1e-6 || forceBar) {
                measures.push(current);
                current = [];
                used = 0;
                if (forceBar && used === 0 && element.repeatEnd) used = 0;
            }
        });

        // Хвост: если такт неполный, он всё равно должен попасть в файл
        if (current.length) measures.push(current);

        return measures;
    }

    function durationXml(element, type) {
        var ticks = Math.round(beatsOf(element) * DIVISIONS);
        if (ticks <= 0) ticks = DIVISIONS;

        var typeXml = type ? '                <type>' + type + '</type>' : null;

        var dots = Number(element.dotted) || 0;
        if (element.dotted === true) dots = 1;
        var dotXml = dots > 0 ? '                <dot/>' : null;

        return { ticks: ticks, typeXml: typeXml, dotXml: dotXml };
    }

    function noteXml(element, options) {
        var indent = '            ';
        var out = [];
        var notes = [];

        var type = TYPE_BY_DENOMINATOR[Number(element.duration) || 4] || 'quarter';
        var duration = durationXml(element, type);

        if (element.isRest) {
            notes.push(indent + '<note>');
            notes.push(indent + '    <rest/>');
            notes.push(indent + '    <duration>' + duration.ticks + '</duration>');
        } else {
            var pitch = pitchOf(element.noteName);
            if (!pitch) return [];

            notes.push(indent + '<note>');
            notes.push(indent + '    <pitch>');
            notes.push(indent + '        <step>' + pitch.step + '</step>');
            if (pitch.alter !== 0) {
                notes.push(indent + '        <alter>' + pitch.alter + '</alter>');
            }
            notes.push(indent + '        <octave>' + pitch.octave + '</octave>');
            notes.push(indent + '    </pitch>');
            notes.push(indent + '    <duration>' + duration.ticks + '</duration>');

            if (options.tieStart) notes.push(indent + '    <tie type="start"/>');
            if (options.tieStop) notes.push(indent + '    <tie type="stop"/>');
        }

        notes.push(indent + '    <voice>1</voice>');
        if (duration.typeXml) notes.push(indent + '    ' + duration.typeXml.trim());
        if (duration.dotXml) notes.push(indent + '    ' + duration.dotXml.trim());

        var tuplet = element.tuplet;
        if (tuplet && tuplet.actual && tuplet.normal) {
            notes.push(indent + '    <time-modification>');
            notes.push(indent + '        <actual-notes>' + tuplet.actual + '</actual-notes>');
            notes.push(indent + '        <normal-notes>' + tuplet.normal + '</normal-notes>');
            notes.push(indent + '    </time-modification>');
        }

        if (!element.isRest) {
            notes.push(indent + '    <stem>' + (element.stemUp ? 'up' : 'down') + '</stem>');
        }

        var notations = [];
        if (options.tieStart) notations.push('            <tied type="start"/>');
        if (options.tieStop) notations.push('            <tied type="stop"/>');
        if (options.slurOpen) notations.push('            <slur type="start" number="' + options.slurOpen + '"/>');
        if (options.slurClose) notations.push('            <slur type="stop" number="' + options.slurClose + '"/>');
        if (options.tuplet === 'start') notations.push('            <tuplet type="start" bracket="yes"/>');
        if (options.tuplet === 'stop') notations.push('            <tuplet type="stop"/>');
        if (options.tuplet === 'start-stop') {
            notations.push('            <tuplet type="start" bracket="yes"/>');
            notations.push('            <tuplet type="stop"/>');
        }
        if (options.variant && options.variant > 1) {
            notations.push('            <other-notation>sax-fingering-variant=' + options.variant + '</other-notation>');
        }

        if (notations.length) {
            notes.push(indent + '    <notations>');
            notations.forEach(function (line) { notes.push(line); });
            notes.push(indent + '    </notations>');
        }

        notes.push(indent + '</note>');
        return notes;
    }

    function attributesXml(settings, timeSignature, transpose, fifths) {
        var parts = String(timeSignature || '4/4').split('/');
        var beats = Number(parts[0]) || 4;
        var beatType = Number(parts[1]) || 4;

        var out = [
            '            <attributes>',
            '                <divisions>' + DIVISIONS + '</divisions>',
            '                <key><fifths>' + (Number(fifths) || 0) + '</fifths></key>',
            '                <time>',
            '                    <beats>' + beats + '</beats>',
            '                    <beat-type>' + beatType + '</beat-type>',
            '                </time>',
            '                <clef><sign>G</sign><line>2</line></clef>'
        ];

        // Стандартный элемент для транспонирующих инструментов: чужие
        // программы покажут партию правильно, наше поле остаётся главным
        if (transpose) {
            out.push('                <transpose>');
            out.push('                    <chromatic>' + transpose + '</chromatic>');
            out.push('                </transpose>');
        }

        out.push('            </attributes>');
        return out;
    }

    function tempoXml(tempo) {
        var value = Number(tempo) || 80;
        return [
            '            <direction placement="above">',
            '                <direction-type>',
            '                    <metronome>',
            '                        <beat-unit>quarter</beat-unit>',
            '                        <per-minute>' + value + '</per-minute>',
            '                    </metronome>',
            '                </direction-type>',
            '                <sound tempo="' + value + '"/>',
            '            </direction>'
        ];
    }

    function identificationXml(settings, meta) {
        var fields = [];

        function field(name, value) {
            if (value === null || value === undefined || value === '') return;
            fields.push('            <miscellaneous-field name="' + name + '">' +
                escapeText(value) + '</miscellaneous-field>');
        }

        field('sax-fingering-model', meta.model || 1);
        field('sax-fingering-version', meta.version || '');
        field('sax-fingering-app-shift', settings.appSoundShift);
        field('sax-fingering-instrument-shift', settings.saxShift);
        field('sax-fingering-sounding-names', settings.soundingNames ? 'true' : 'false');
        field('sax-fingering-set', meta.fingeringSet || '');

        var out = [
            '    <identification>',
            '        <software>Saxophone Fingering Assistant</software>'
        ];

        if (fields.length) {
            out.push('        <miscellaneous>');
            fields.forEach(function (line) { out.push('        ' + line.trim()); });
            out.push('        </miscellaneous>');
        }

        out.push('    </identification>');
        return out;
    }

    // elements: элементы приложения по порядку
    // options: { tempo, timeSignature, title, settings, meta }
    function build(options) {
        options = options || {};
        var elements = options.elements || [];
        var settings = options.settings || {};
        var meta = options.meta || {};

        var parts = String(options.timeSignature || '4/4').split('/');
        var beatsPerMeasure = Number(parts[0]) || 4;
        var beatType = Number(parts[1]) || 4;
        // Доли в размере считаем в четвертях: 6/8 это три четверти
        var measureBeats = beatsPerMeasure * (4 / beatType);

        var ties = tieMarks(elements);
        var slurs = slurNumbers(elements);
        var tuplets = tupletMarks(elements);
        var measures = measuresOf(elements, measureBeats);

        var out = [];
        out.push('<?xml version="1.0" encoding="UTF-8"?>');
        out.push('<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 4.0 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">');
        out.push('<score-partwise version="4.0">');

        if (options.title) {
            out.push('    <work>');
            out.push('        <work-title>' + escapeText(options.title) + '</work-title>');
            out.push('    </work>');
        }

        identificationXml(settings, meta).forEach(function (line) { out.push(line); });

        out.push('    <part-list>');
        out.push('        <score-part id="P1">');
        out.push('            <part-name>Saxophone</part-name>');
        out.push('        </score-part>');
        out.push('    </part-list>');
        out.push('    <part id="P1">');

        var elementIndex = 0;
        measures.forEach(function (measure, measureIndex) {
            out.push('        <measure number="' + (measureIndex + 1) + '">');

            if (measureIndex === 0) {
                attributesXml(settings, options.timeSignature, settings.saxShift, settings.keyFifths)
                    .forEach(function (line) { out.push(line); });
                tempoXml(options.tempo).forEach(function (line) { out.push(line); });
            }

            // Левая черта вольты идёт до нот: иначе при чтении номер не привяжется
            var voltaStart = measure.filter(function (element) { return element.voltaStart; })[0];
            if (voltaStart) {
                out.push('            <barline location="left">');
                out.push('                <ending number="' + escapeText(voltaStart.voltaStart) + '" type="start"/>');
                out.push('            </barline>');
            }

            measure.forEach(function (element) {
                var index = elementIndex++;
                var lines = noteXml(element, {
                    tieStart: ties.starts[index],
                    tieStop: ties.stops[index],
                    slurOpen: slurs.open[index],
                    slurClose: slurs.close[index],
                    tuplet: tuplets[index],
                    variant: element.currentVariant
                });
                lines.forEach(function (line) { out.push(line); });
            });

            if (measure.some(function (element) { return element.voltaStop; })) {
                out.push('            <barline location="right">');
                out.push('                <ending number="' + escapeText(voltaStart ? voltaStart.voltaStart : '') + '" type="stop"/>');
                out.push('            </barline>');
            }

            if (measure.some(function (element) { return element.repeatStart; })) {
                out.push('            <barline location="left">');
                out.push('                <repeat direction="forward"/>');
                out.push('            </barline>');
            }
            if (measure.some(function (element) { return element.repeatEnd; })) {
                out.push('            <barline location="right">');
                out.push('                <repeat direction="backward"/>');
                out.push('            </barline>');
            }

            out.push('        </measure>');
        });

        out.push('    </part>');
        out.push('</score-partwise>');
        out.push('');

        return out.join('\n');
    }

    // === Чтение ===

    function unescapeXml(value) {
        return String(value || '')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"')
            .replace(/&apos;/g, "'")
            .replace(/&amp;/g, '&');
    }

    function textOf(xml, tag) {
        var match = new RegExp('<' + tag + '[^>]*>([\\s\\S]*?)</' + tag + '>').exec(xml);
        return match ? unescapeXml(match[1]).trim() : '';
    }

    var DENOMINATOR_BY_TYPE = {};
    Object.keys(TYPE_BY_DENOMINATOR).forEach(function (key) {
        DENOMINATOR_BY_TYPE[TYPE_BY_DENOMINATOR[key]] = Number(key);
    });

    // Длительность: у нас она хранится знаком и точками, а не тиками
    // MusicXML пишет типы нот как 16th, 32nd, 64th, а не sixteenth,
    // thirty-second. Без этих ключей шестнадцатая читалась как четверть:
    // срабатывало запасное значение 4
    DENOMINATOR_BY_TYPE['16th'] = 16;
    DENOMINATOR_BY_TYPE['32nd'] = 32;
    DENOMINATOR_BY_TYPE['64th'] = 64;
    DENOMINATOR_BY_TYPE['128th'] = 128;
    DENOMINATOR_BY_TYPE['256th'] = 256;

    function parseTiming(noteXml) {
        var type = textOf(noteXml, 'type');
        var denominator = DENOMINATOR_BY_TYPE[type] || 4;
        var dots = (noteXml.match(/<dot\s*\/>/g) || []).length;

        var modification = /<time-modification>[\s\S]*?<actual-notes>(\d+)<\/actual-notes>[\s\S]*?<normal-notes>(\d+)<\/normal-notes>[\s\S]*?<\/time-modification>/.exec(noteXml);
        var tuplet = modification
            ? { actual: Number(modification[1]), normal: Number(modification[2]) }
            : null;

        return { duration: denominator, dotted: dots, tuplet: tuplet };
    }

    // Длительности, которыми запись вообще может быть записана
    var FIT_DENOMINATORS = [1, 2, 4, 8, 16, 32, 64];
    var FIT_TUPLETS = [
        null,
        { actual: 3, normal: 2 },
        { actual: 5, normal: 4 },
        { actual: 7, normal: 4 }
    ];

    // Точное время ноты из <duration>: в MusicXML это и есть настоящее время,
    // а <type> - только то, как нота записана
    function durationBeats(noteXml, divisions) {
        if (!divisions) return null;
        var match = /<duration>(\d+)<\/duration>/.exec(noteXml);
        if (!match) return null;
        return Number(match[1]) / divisions;
    }

    // Подбор записываемой длительности по точному времени. Конвертеры из MIDI
    // пишут <type> приблизительно (например, обычную восьмую там, где на самом
    // деле триольная четверть). Если верить <type>, мелодия играет не по сетке
    // тактов и расходится с сопровождением: в чистке New York сумма выходила
    // 314.7 доли вместо 352.
    // Возвращает null, если написанное уже совпадает с точным или подходящей
    // записываемой длительности нет - тогда остаётся то, что в файле
    function fitTiming(trueBeats, timing) {
        if (!trueBeats || !(trueBeats > 0)) return null;

        var written = beatsOf({
            duration: timing.duration,
            dotted: timing.dotted,
            tuplet: timing.tuplet
        });
        if (Math.abs(written - trueBeats) < 0.01) return null;

        var best = null;
        FIT_DENOMINATORS.forEach(function (denominator) {
            FIT_TUPLETS.forEach(function (tuplet) {
                for (var dots = 0; dots <= 3; dots++) {
                    var beats = beatsOf({ duration: denominator, dotted: dots, tuplet: tuplet });
                    var diff = Math.abs(beats - trueBeats);
                    if (diff > 0.01) continue;
                    if (!best || diff < best.diff) {
                        best = { diff: diff, duration: denominator, dotted: dots, tuplet: tuplet };
                    }
                }
            });
        });

        return best;
    }


    // Структура файла: партии, их имена, программы и ударные инструменты.
    // Считается один раз на файл: раньше каждый разбор заново проходил по
    // всему тексту, а при открытии файла разборов бывает десяток - на трёх
    // мегабайтах это заметные секунды
    var fileCache = { text: null, value: null };

    function fileOf(text) {
        if (fileCache.text === text) return fileCache.value;

        var index = { parts: [], names: {}, programs: {}, drums: {} };

        blocks(text, 'part').forEach(function (part) {
            index.parts.push({ id: attributeOf(part.attrs, 'id'), body: part.inner });
        });
        // Партия без разметки: считаем весь текст одной партией
        if (!index.parts.length) index.parts.push({ id: '', body: text });

        blocks(text, 'score-part').forEach(function (part) {
            var id = attributeOf(part.attrs, 'id');
            index.names[id] = textOf(part.inner, 'part-name');
            var program = /<midi-program>(\d+)<\/midi-program>/.exec(part.inner);
            if (program) index.programs[id] = Number(program[1]);
            // Ударные: названия вроде "Kick (hit)" или "Crash medium (hit)"
            var instruments = instrumentNames(part.inner);
            Object.keys(instruments).forEach(function (key) {
                var number = drumNumber(instruments[key]);
                if (number !== null) index.drums[key] = number;
            });
        });

        fileCache = { text: text, value: index };
        return index;
    }

    // Список партий файла: имя, программа, сколько нот. Нужен, чтобы предложить
    // выбор, когда в файле больше одного инструмента
    function listParts(xml) {
        var text = String(xml || '');
        var index = fileOf(text);
        return index.parts.map(function (part) {
            return {
                id: part.id,
                name: index.names[part.id] || part.id,
                program: index.programs[part.id] || null,
                noteCount: (part.body.match(/<note(\s[^>]*)?>/g) || []).length,
                polyphonic: /<backup>/.test(part.body)
            };
        });
    }

    // Разбор MusicXML. Терпимый: незнакомые элементы пропускаем, а не падаем -
    // файлы приходят из MuseScore, Audiveris и откуда угодно
    function parse(xml, wantedPartId) {
        var text = String(xml || '');
        var settings = {};
        var meta = {};

        var fieldRe = /<miscellaneous-field name="([^"]+)"[^>]*>([\s\S]*?)<\/miscellaneous-field>/g;
        var field;
        while ((field = fieldRe.exec(text))) {
            var name = field[1];
            var value = unescapeXml(field[2]).trim();

            if (name === 'sax-fingering-app-shift') settings.appSoundShift = Number(value);
            else if (name === 'sax-fingering-instrument-shift') settings.saxShift = Number(value);
            else if (name === 'sax-fingering-sounding-names') settings.soundingNames = value === 'true';
            else if (name === 'sax-fingering-set') meta.fingeringSet = value;
            else if (name === 'sax-fingering-model') meta.model = Number(value);
            else if (name === 'sax-fingering-version') meta.version = value;
        }

        // Партии: в одном файле может быть несколько инструментов. Саксофон
        // пишется одной линией, а сопровождение - с <backup> и вторым голосом
        var file = fileOf(text);
        var parts = file.parts;
        var partNames = file.names;
        var partPrograms = file.programs;

        function partScore(part) {
            var name = String(partNames[part.id] || '').toLowerCase();
            var program = partPrograms[part.id];
            var score = 0;

            if (/sax|сакс/.test(name)) score += 30;
            if (/alto|tenor|soprano|baritone|альт|тенор|сопрано|баритон/.test(name)) score += 10;
            // 65..68 в General MIDI - это сопрановый, альтовый, теноровый и баритоновый саксофоны
            if (program >= 65 && program <= 68) score += 30;

            // Сопровождение почти всегда многоголосое
            var backups = (part.body.match(/<backup>/g) || []).length;
            score -= Math.min(30, backups * 4);
            return score;
        }

        var chosenPart = null;
        if (wantedPartId) {
            parts.forEach(function (part) { if (part.id === wantedPartId) chosenPart = part; });
        }
        if (!chosenPart) {
            chosenPart = parts[0];
            parts.forEach(function (part) {
                if (partScore(part) > partScore(chosenPart)) chosenPart = part;
            });
        }
        var body = chosenPart.body;
        var beats = textOf(body, 'beats');
        var beatType = textOf(body, 'beat-type');
        // Темп и тональность бывают только в одной из партий, поэтому ищем и в файле
        var tempoMatch = /<sound[^>]*tempo="([\d.]+)"/.exec(body) || /<sound[^>]*tempo="([\d.]+)"/.exec(text);

        var fifthsMatch = /<fifths>(-?\d+)<\/fifths>/.exec(body) || /<fifths>(-?\d+)<\/fifths>/.exec(text);

        // Ключ: у саксофона всегда скрипичный. Если в файле другой, читаем как
        // есть, но приложение предупредит - ноты могут уехать по высоте
        var clefMatch = /<clef[^>]*>[\s\S]*?<sign>([A-G])<\/sign>/.exec(body);
        var clefSign = clefMatch ? clefMatch[1] : '';


        // Позиции берём из общего прохода: время считается от начала такта,
        // а не суммой подряд. Раньше партия с двумя станами (<backup>)
        // склеивалась в одну линию, и мелодия уезжала от сопровождения:
        // у струнных - на 35 долей, у рояля - на 4
        var walked = walkPart(body, file.drums);
        var items = walked.items;

        var elements = [];
        var skippedChords = 0;
        var skippedGrace = 0;
        var voices = {};

        // Один голос: там, где нот больше. Иначе многоголосие склеилось бы в кашу
        items.forEach(function (item) {
            if (item.isGrace) { skippedGrace++; return; }
            if (item.tab) return;
            voices[item.voice] = (voices[item.voice] || 0) + 1;
        });
        var voiceKeys = Object.keys(voices);
        var mainVoice = '';
        voiceKeys.forEach(function (key) {
            if (!mainVoice || voices[key] > voices[mainVoice]) mainVoice = key;
        });
        var droppedVoices = 0;
        if (voiceKeys.length > 1) {
            items.forEach(function (item) {
                if (!item.isGrace && !item.tab && item.voice !== mainVoice) droppedVoices++;
            });
        }

        // Время идёт по позициям файла. Порядок в документе может быть не по
        // времени, поэтому сортируем
        var line = items
            .filter(function (item) { return !item.isGrace && !item.tab && item.voice === mainVoice; })
            .sort(function (a, b) { return a.startBeat - b.startBeat; });

        var cursor = 0;      // докуда дошла линейная запись
        var lastNote = null; // предыдущая нота - для наложений

        // Записываемые паузы от целой вниз: разрыв в сорок долей нельзя
        // нарисовать одной паузой, поэтому набираем сумму из нескольких
        var REST_LADDER = [
            { duration: 1, dotted: 0, beats: 4 },
            { duration: 2, dotted: 1, beats: 3 },
            { duration: 2, dotted: 0, beats: 2 },
            { duration: 4, dotted: 1, beats: 1.5 },
            { duration: 4, dotted: 0, beats: 1 },
            { duration: 8, dotted: 1, beats: 0.75 },
            { duration: 8, dotted: 0, beats: 0.5 },
            { duration: 16, dotted: 1, beats: 0.375 },
            { duration: 16, dotted: 0, beats: 0.25 },
            { duration: 32, dotted: 1, beats: 0.1875 },
            { duration: 32, dotted: 0, beats: 0.125 },
            { duration: 64, dotted: 0, beats: 0.0625 }
        ];

        // Разрыв между элементами заполняем паузами: иначе стан окажется
        // короче пьесы и мелодия убежит вперёд
        function pushRest(beats) {
            var remaining = beats;
            while (remaining > 0.01) {
                var value = null;
                for (var i = 0; i < REST_LADDER.length; i++) {
                    if (REST_LADDER[i].beats <= remaining + 1e-6) { value = REST_LADDER[i]; break; }
                }
                // Остаток меньше самой мелкой паузы: пишем его с точным временем
                if (!value) value = { duration: 64, dotted: 0, beats: 0 };

                var rest = {
                    isRest: true,
                    noteName: null,
                    displayName: null,
                    duration: value.duration,
                    dotted: value.dotted,
                    currentVariant: 1,
                    // Настоящее время паузы: запись его может не выражать
                    beats: value.beats || remaining
                };
                elements.push(rest);
                remaining -= rest.beats;
                cursor += rest.beats;
                lastNote = null;
            }
        }

        line.forEach(function (item) {
            var gap = item.startBeat - cursor;
            if (gap > 0.01) pushRest(gap);

            var element = {
                isRest: item.isRest,
                noteName: item.noteName || null,
                displayName: item.noteName || null,
                duration: item.durationType,
                dotted: item.dotted,
                currentVariant: Number(item.variant) || 1,
                // Точное время из файла: запись его не всегда выражает
                beats: item.beats
            };
            if (item.tuplet) element.tuplet = item.tuplet;
            if (item.tiedToNext) element.tiedToNext = true;
            if (item.slurStart) element.slurStart = true;
            if (item.slurEnd) element.slurEnd = true;
            if (item.voltaStart) element.voltaStart = item.voltaStart;
            if (item.voltaStop) element.voltaStop = true;
            if (item.repeatStart) element.repeatStart = true;
            if (item.repeatEnd) element.repeatEnd = true;

            // Наложение: этот момент уже занят нотой. Приложение одноголосное,
            // поэтому остаётся верхняя линия - так же, как из аккорда
            if (!item.isRest && item.startBeat < cursor - 0.01) {
                if (item.isChord) skippedChords++;
                var busy = elements.length ? elements[elements.length - 1] : null;
                if (!busy) return;
                // Длительность берём у занятого места: иначе время потеряется
                var span = busy.beats;
                var overWas = busy.isRest ? null : pitchNumber(busy.noteName);
                var overNow = pitchNumber(element.noteName);
                var better = busy.isRest || (overWas !== null && overNow !== null && overNow > overWas);
                if (better) {
                    element.beats = span;
                    elements[elements.length - 1] = element;
                    lastNote = element;
                }
                return;
            }
            if (item.isChord) { skippedChords++; return; }

            elements.push(element);
            lastNote = element;
            cursor = item.startBeat + item.beats;
        });

        // Хвост пьесы: если партия замолкает раньше конца, добираем паузой -
        // иначе стан короче сопровождения
        if (walked.endBeat - cursor > 0.01) pushRest(walked.endBeat - cursor);


        return {
            elements: elements,
            tempo: tempoMatch ? Number(tempoMatch[1]) : 0,
            timeSignature: (beats && beatType) ? (beats + '/' + beatType) : '',
            fifths: fifthsMatch ? Number(fifthsMatch[1]) : null,
            partCount: parts.length,
            partNames: parts.map(function (part) { return partNames[part.id] || part.id; }),
            chosenPart: partNames[chosenPart.id] || chosenPart.id,
            clefSign: clefSign,
            skippedChords: skippedChords,
            skippedGrace: skippedGrace,
            skippedVoices: droppedVoices,
            // Длина партии в долях: видно, совпадает ли стан с пьесой
            endBeat: walked.endBeat,
            settings: settings,
            meta: meta
        };
    }

    // === Чтение партии для сопровождения ===
    //
    // parse() выше сводит партию к одной линии для стана: он читает ноты подряд,
    // а <backup> и <forward> не разбирает вовсе. Для сопровождения этого мало:
    // у фортепиано, струнных и барабанов ноты идут в несколько голосов, и время
    // всех голосов кроме главного теряется. Из-за этого партия кончалась раньше
    // пьесы: барабаны на 218-й доле из 360.
    //
    // Здесь другая задача - нужны ВСЕ голоса и настоящие позиции. Позиция ноты
    // считается от начала такта плюс курсор внутри такта:
    //   - <note> двигает курсор на свою длительность;
    //   - <note> с <chord/> звучит там же, где предыдущая, курсор не двигает;
    //   - <backup> отводит курсор назад, <forward> вперёд;
    //   - смена <divisions> внутри такта пересчитывает курсор и длину такта.
    // Длительность берётся из <duration>: в MusicXML это уже настоящее время,
    // триоль учтена в нём самом, а <time-modification> нужен только для вида.

    // Разбор всех элементов с этим именем: атрибуты и содержимое по порядку.
    // Самозакрытый элемент (<measure/>) даёт пустое содержимое, а не съедает
    // следующие за ним такты
    function blocks(xml, tag) {
        var out = [];
        var open = new RegExp('<' + tag + '(?=[\\s/>])([^>]*?)(/)?>', 'g');
        var match;
        while ((match = open.exec(xml))) {
            var attrs = ' ' + (match[1] || '') + ' ';
            if (match[2]) { out.push({ attrs: attrs, inner: '' }); continue; }
            var close = xml.indexOf('</' + tag + '>', open.lastIndex);
            if (close < 0) { out.push({ attrs: attrs, inner: xml.slice(open.lastIndex) }); break; }
            out.push({ attrs: attrs, inner: xml.slice(open.lastIndex, close) });
            open.lastIndex = close + tag.length + 3;
        }
        return out;
    }

    function attributeOf(attrs, name) {
        var match = new RegExp(name + '=[\\x22\\x27]([^\\x22\\x27]*)[\\x22\\x27]').exec(attrs);
        return match ? match[1] : '';
    }

    // На сколько партия звучит выше написанного: <chromatic> плюс <octave-change>
    // октавами. Пишется один раз в начале, но бывает и в середине: тогда null
    // значит "указания нет", а не "сдвиг ноль"
    function transposeOf(xml) {
        var block = /<transpose(?=[\s\/>])[\s\S]*?<\/transpose>/.exec(xml);
        if (!block) return null;
        var chromatic = /<chromatic>(-?\d+)<\/chromatic>/.exec(block[0]);
        var octave = /<octave-change>(-?\d+)<\/octave-change>/.exec(block[0]);
        return (chromatic ? Number(chromatic[1]) : 0) + (octave ? Number(octave[1]) * 12 : 0);
    }

    // Высота ноты в полутонах MIDI (ля первой октавы 69, как в playback.js).
    // У барабанов вместо <pitch> стоит <unpitched> с display-step и display-octave
    function midiOfNote(noteXml) {
        var unpitched = /<unpitched(?=[\s\/>])/.test(noteXml);
        var prefix = unpitched ? 'display-' : '';
        var stepMatch = new RegExp('<' + prefix + 'step>([^<]*)</' + prefix + 'step>').exec(noteXml);
        if (!stepMatch) return null;

        var alterMatch = new RegExp('<' + prefix + 'alter>([^<]*)</' + prefix + 'alter>').exec(noteXml);
        var octaveMatch = new RegExp('<' + prefix + 'octave>([^<]*)</' + prefix + 'octave>').exec(noteXml);
        var alter = alterMatch ? Number(alterMatch[1]) || 0 : 0;
        var accidental = alter > 0 ? '#' : (alter < 0 ? 'b' : '');
        var name = stepMatch[1].trim() + accidental + (octaveMatch ? octaveMatch[1].trim() : '4');

        // pitchNumber считает от до нулевой октавы (C4 = 48), а приложение и
        // MIDI - от до первой (C4 = 60). Без этой поправки сопровождение
        // звучало бы на октаву ниже сопровождения из MIDI
        var midi = pitchNumber(name);
        if (midi === null) return null;
        return { midi: midi + 12, unpitched: unpitched, name: name };
    }

    // Порядок элементов внутри такта: ноты, отводы курсора, смена атрибутов,
    // тактовые черты и указания (8va, вольты, репризы)
    function measureTokens(body) {
        var tokens = [];
        var open = /<(note|backup|forward|attributes|barline|direction)(?=[\s\/>])([^>]*?)(\/)?>/g;
        var match;
        while ((match = open.exec(body))) {
            var tag = match[1];
            if (match[3]) { tokens.push({ tag: tag, inner: '' }); continue; }
            var close = body.indexOf('</' + tag + '>', open.lastIndex);
            if (close < 0) { tokens.push({ tag: tag, inner: body.slice(open.lastIndex) }); break; }
            tokens.push({ tag: tag, inner: body.slice(open.lastIndex, close) });
            open.lastIndex = close + tag.length + 3;
        }
        return tokens;
    }

    // Номер барабана General MIDI по названию инструмента из файла.
    // У барабанов нет высоты, но по названию понятно, что это: бочка, малый,
    // хай-хэт или тарелка. Нужен приложению, чтобы щелчки отличались: без него
    // вся партия звучит ровным тиканьем, и ритм перестаёт читаться.
    // Порядок проверок важен: "Snare (side stick)" должен стать ободом,
    // "Pedal Hi-Hat" - педалью, а не обычным хай-хэтом
    var DRUM_NUMBERS = [
        [/kick|bass drum|бочк/i, 36],
        [/side stick|rim ?shot|обод/i, 37],
        [/pedal hi-?hat|pedal hat/i, 44],
        [/open hi-?hat|open hat|hi-?hat \(open\)/i, 46],
        [/hi-?hat|hihat|хэт|хет/i, 42],
        [/snare|малы/i, 38],
        [/ride/i, 51],
        [/crash|splash|china|тарел/i, 49],
        [/high tom|high floor tom/i, 48],
        [/mid tom|средн.*том/i, 47],
        [/low tom|very low tom|floor tom/i, 45]
    ];

    function drumNumber(name) {
        var text = String(name || '');
        for (var i = 0; i < DRUM_NUMBERS.length; i++) {
            if (DRUM_NUMBERS[i][0].test(text)) return DRUM_NUMBERS[i][1];
        }
        return null;
    }

    // Названия инструментов партии по их номерам: <score-instrument id="P9-I8">
    function instrumentNames(partBody) {
        var names = {};
        var re = /<score-instrument(?=[\s\/>])([^>]*?)(\/)?>([\s\S]*?)<\/score-instrument>/g;
        var match;
        while ((match = re.exec(partBody))) {
            var id = attributeOf(' ' + match[1] + ' ', 'id');
            if (id) names[id] = textOf(match[3], 'instrument-name');
        }
        return names;
    }

    // Один проход по партии: все ноты и паузы с настоящими позициями.
    //
    // Это единственное место, где считается время. И стан, и сопровождение
    // берут позиции отсюда: раньше стан считал время суммой длительностей
    // подряд, а сопровождение - от начала такта, и партии с <backup> уезжали
    // друг относительно друга (у струнных - на 35 долей, у рояля - на 4).
    //
    // Правила:
    //   - <note> двигает курсор на свою длительность, <note> с <chord/> - нет;
    //   - <backup> отводит курсор назад, <forward> вперёд;
    //   - смена <divisions> пересчитывает курсор и длину такта;
    //   - длина такта - докуда он дошёл (верно для затакта и смены размера);
    //   - такт, не влезающий в размер, укладывается в него (так выходят
    //     барабанные дроби у Guitar Pro).
    function walkPart(body, drums) {
        var measures = blocks(body, 'measure');
        // Партия без тактов: считаем её содержимое одним тактом
        if (!measures.length && body) measures = [{ inner: body }];

        var transpose = transposeOf(body);
        if (transpose === null) transpose = 0;
        // Ударные узнаются по ключу перкуссии и по нотам без высоты
        var percussion = /<sign>\s*percussion\s*<\/sign>/.test(body);
        drums = drums || {};

        // Табулатурный стан - не второй инструмент, а та же музыка, записанная
        // цифрами: у гитары и струнных он дублирует ноты (иногда на октаву ниже)
        var tabStaves = {};
        var clefRe = /<clef(?=[\s\/>])([^>]*?)(\/)?>([\s\S]*?)<\/clef>/g;
        var clefMatch;
        while ((clefMatch = clefRe.exec(body))) {
            if (!/<sign>\s*TAB\s*<\/sign>/.test(clefMatch[3])) continue;
            var clefNumber = attributeOf(' ' + clefMatch[1] + ' ', 'number');
            tabStaves[clefNumber || '1'] = true;
        }

        var divisions = 1;
        var hasDivisions = false;
        var measureBeats = 4;
        var hasTime = false;
        var measureStart = 0;
        var measureLengths = [];
        var items = [];
        var octaveShift = 0;
        var pendingVolta = null;   // номер концовки, объявленной перед нотами
        var pendingRepeat = false; // реприза, объявленная перед нотами

        measures.forEach(function (measure) {
            var cursor = 0;
            var maxCursor = 0;
            var previousStart = null;
            var times = /<time(?=[\s\/>])[\s\S]*?<beats>(\d+)<\/beats>[\s\S]*?<beat-type>(\d+)<\/beat-type>[\s\S]*?<\/time>/.exec(measure.inner);
            if (times) {
                measureBeats = Number(times[1]) * 4 / Number(times[2]);
                hasTime = true;
            }

            var inMeasure = [];

            measureTokens(measure.inner).forEach(function (token) {
                var inner = token.inner;

                if (token.tag === 'barline') {
                    // Вольта: начало помечаем следующей ноте, конец - предыдущей
                    var ending = /<ending([^>]*)>/.exec(inner);
                    if (ending) {
                        var endingNumber = attributeOf(' ' + ending[1] + ' ', 'number');
                        var endingType = attributeOf(' ' + ending[1] + ' ', 'type');
                        if (endingType === 'start') pendingVolta = endingNumber;
                        else if (endingType === 'stop' || endingType === 'discontinue') {
                            var lastItem = inMeasure.length ? inMeasure[inMeasure.length - 1]
                                : (items.length ? items[items.length - 1] : null);
                            if (lastItem) lastItem.voltaStop = true;
                        }
                    }
                    // Репризы: у приложения свои метки на элементах
                    if (/<repeat[^>]*direction=[\x22\x27]backward[\x22\x27]/.test(inner)) {
                        var lastRepeat = inMeasure.length ? inMeasure[inMeasure.length - 1]
                            : (items.length ? items[items.length - 1] : null);
                        if (lastRepeat) lastRepeat.repeatEnd = true;
                    }
                    if (/<repeat[^>]*direction=[\x22\x27]forward[\x22\x27]/.test(inner)) pendingRepeat = true;
                    return;
                }

                if (token.tag === 'direction') {
                    var shiftTag = /<octave-shift[^>]*>/.exec(inner);
                    if (shiftTag) {
                        var shiftType = attributeOf(' ' + shiftTag[0], 'type');
                        var size = Number(attributeOf(' ' + shiftTag[0], 'size')) || 8;
                        var steps = size === 15 ? 24 : (size === 22 ? 36 : 12);
                        if (shiftType === 'up') octaveShift = steps;
                        else if (shiftType === 'down') octaveShift = -steps;
                        else if (shiftType === 'stop') octaveShift = 0;
                        // continue значит знак тянется на следующую строку: оставляем
                    }
                    return;
                }

                if (token.tag === 'attributes') {
                    var divMatch = /<divisions>(\d+)<\/divisions>/.exec(inner);
                    if (divMatch) {
                        var next = Number(divMatch[1]);
                        // Курсор и длина такта уже набраны в прежних делениях:
                        // без пересчёта позиция после смены уедет
                        if (next > 0) hasDivisions = true;
                        if (next > 0 && next !== divisions) {
                            cursor = cursor * next / divisions;
                            maxCursor = maxCursor * next / divisions;
                            divisions = next;
                        }
                    }
                    var shift = transposeOf(inner);
                    if (shift !== null) transpose = shift;
                    if (/<sign>\s*percussion\s*<\/sign>/.test(inner)) percussion = true;
                    return;
                }

                if (token.tag === 'backup' || token.tag === 'forward') {
                    var move = Number(textOf(inner, 'duration')) || 0;
                    cursor = token.tag === 'backup' ? Math.max(0, cursor - move) : cursor + move;
                    if (cursor > maxCursor) maxCursor = cursor;
                    previousStart = null;
                    return;
                }

                // Ноты и паузы
                var isChord = /<chord(?=[\s\/>])/.test(inner);
                var isGrace = /<grace(?=[\s\/>])/.test(inner);
                var isRest = /<rest(?=[\s\/>])/.test(inner);
                var timing = parseTiming(inner);

                var duration = Number(textOf(inner, 'duration')) || 0;
                // В файле без <divisions> число в <duration> бессмысленно:
                // считаем время по записанной длительности
                if (!hasDivisions) {
                    // У форшлага времени нет в любом случае
                    duration = isGrace ? 0 : beatsOf({
                        duration: timing.duration, dotted: timing.dotted, tuplet: timing.tuplet
                    }) * divisions;
                }

                var start = (isChord && previousStart !== null) ? previousStart : cursor;
                if (!isChord) {
                    previousStart = cursor;
                    cursor += duration;
                    if (cursor > maxCursor) maxCursor = cursor;
                }

                // Точное время важнее написанного: иначе такт не сходится.
                // Триоли записаны явно - их не пересчитываем
                var trueBeats = (isGrace || !hasDivisions) ? 0 : (timing.tuplet ? null : durationBeats(inner, divisions));
                var fitted = fitTiming(trueBeats, timing);
                if (fitted) {
                    timing.duration = fitted.duration;
                    timing.dotted = fitted.dotted;
                    timing.tuplet = fitted.tuplet;
                }

                var item = {
                    start: start,
                    duration: duration,
                    isRest: isRest,
                    isChord: isChord,
                    isGrace: isGrace,
                    voice: textOf(inner, 'voice') || '1',
                    staff: textOf(inner, 'staff') || '1',
                    tab: !!tabStaves[textOf(inner, 'staff') || '1'],
                    // Как нота записана - для знака на стане
                    durationType: timing.duration,
                    dotted: timing.dotted,
                    tuplet: timing.tuplet,
                    tiedToNext: /<tie[^>]*type=[\x22\x27]start[\x22\x27]/.test(inner),
                    slurStart: /<slur[^>]*type=[\x22\x27]start[\x22\x27]/.test(inner),
                    slurEnd: /<slur[^>]*type=[\x22\x27]stop[\x22\x27]/.test(inner),
                    voltaStart: pendingVolta,
                    repeatStart: pendingRepeat,
                    // Вариант аппликатуры из расширения приложения
                    variant: (/sax-fingering-variant=(\d+)/.exec(inner) || [0, 1])[1]
                };
                pendingVolta = null;
                pendingRepeat = false;

                if (!isRest) {
                    var pitch = midiOfNote(inner);
                    // Ноту без высоты, которую мы не понимаем, лучше пропустить
                    if (!pitch) return;
                    item.unpitched = pitch.unpitched;
                    item.noteName = pitch.name;
                    item.pitch = pitch.midi;

                    // 8va и 8vb: ноты записаны условно, звучат на октаву выше/ниже
                    if (octaveShift) {
                        item.pitch = pitch.midi + octaveShift;
                        var decoded = pitchOf(pitch.name);
                        if (decoded && !pitch.unpitched) {
                            var accidental = decoded.alter > 0 ? '#' : (decoded.alter < 0 ? 'b' : '');
                            item.noteName = decoded.step + accidental + (decoded.octave + octaveShift / 12);
                        }
                    }

                    // Ударные: по названию инструмента видно, бочка это или хай-хэт
                    if (pitch.unpitched) {
                        percussion = true;
                        var instrumentMatch = /<instrument(?=[\s\/>])([^>]*?)(\/)?>/.exec(inner);
                        var instrumentId = instrumentMatch ? attributeOf(' ' + instrumentMatch[1] + ' ', 'id') : '';
                        if (instrumentId && drums[instrumentId]) item.drumNumber = drums[instrumentId];
                    }
                }

                inMeasure.push(item);
            });

            // Длина такта - докуда он дошёл. Так это верно и для затакта,
            // и для смены размера, и для такта с несколькими голосами
            var length = maxCursor / divisions;
            // Пустой такт не должен съедать время: берём размер
            if (length <= 0) length = measureBeats;

            // Такт, который не влезает в размер, встречается в чужих выгрузках:
            // у Guitar Pro так выходят барабанные дроби, и там же теряются ноты.
            // Такой такт сдвинул бы всё после себя, поэтому укладываем его
            // ноты в размер такта
            var factor = 1;
            if (hasTime && length > measureBeats + 1e-6) {
                factor = measureBeats / length;
                length = measureBeats;
            }

            inMeasure.forEach(function (item) {
                item.startBeat = measureStart + item.start * factor / divisions;
                item.beats = item.duration * factor / divisions;
                items.push(item);
            });

            measureLengths.push(length);
            measureStart += length;
        });

        return {
            items: items,
            transpose: transpose,
            percussion: percussion,
            divisions: divisions,
            measureCount: measures.length,
            measureLengths: measureLengths,
            endBeat: measureStart
        };
    }

    // Разбор одной партии целиком: абсолютные позиции в долях,
    // транспозиция партии и признак ударных
    function parsePart(xml, partId) {
        var text = String(xml || '');
        var file = fileOf(text);
        var chosen = null;
        file.parts.forEach(function (part) {
            if (chosen) return;
            if (!partId || part.id === partId) chosen = part;
        });
        var names = file.names;

        var body = chosen ? chosen.body : '';
        var walked = walkPart(body, file.drums);
        var transpose = walked.transpose;
        var percussion = walked.percussion;

        var notes = [];
        var lastByVoice = {};
        var tied = {};

        walked.items.forEach(function (item) {
            // Форшлаг времени не занимает и в сопровождении не играется
            if (item.isGrace || item.isRest) return;
            // Ноты табулатурного стана пропускаем: это тот же материал
            if (item.tab) return;

            var midi = item.unpitched ? (item.drumNumber || item.pitch) : (item.pitch + transpose);

            // Связанные ноты по разные стороны черты - это одна нота.
            // Без склейки на стыке слышен лишний удар
            var previous = lastByVoice[item.voice];
            if (tied[item.voice] && previous && previous.midi === midi &&
                Math.abs(previous.startBeat + previous.beats - item.startBeat) < 1e-6) {
                previous.beats = item.startBeat + item.beats - previous.startBeat;
            } else {
                var note = {
                    midi: midi, startBeat: item.startBeat, beats: item.beats,
                    voice: item.voice, chord: !!item.isChord
                };
                notes.push(note);
                lastByVoice[item.voice] = note;
            }
            tied[item.voice] = item.tiedToNext;
        });

        return {
            ok: !!chosen,
            id: chosen ? attributeOf(chosen.attrs, 'id') : '',
            name: names[chosen ? attributeOf(chosen.attrs, 'id') : ''] || '',
            percussion: percussion,
            transpose: transpose,
            divisions: walked.divisions,
            measureCount: walked.measureCount,
            measureLengths: walked.measureLengths,
            endBeat: walked.endBeat,
            notes: notes
        };
    }

    return {
        DIVISIONS: DIVISIONS,
        build: build,
        parse: parse,
        parsePart: parsePart,
        listParts: listParts,
        beatsOf: beatsOf,
        pitchOf: pitchOf
    };
});
