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

    // Доли одной ноты: длительность, точки и отношение триоли
    function beatsOf(element) {
        var denominator = Number(element.duration) || 4;
        var beats = 4 / denominator;

        var dots = Number(element.dotted) || 0;
        if (element.dotted === true) dots = 1;
        if (dots > 0) beats += beats / 2;
        if (dots > 1) beats += beats / 4;
        if (dots > 2) beats += beats / 8;

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

    function parseNote(noteXml) {
        var isRest = /<rest\s*\/>/.test(noteXml);
        // <chord/> означает, что это ещё один тон того же аккорда.
        // Приложение одноголосное, поэтому дополнительный тон пропускаем:
        // остаётся первый, то есть верхний - как и при импорте MIDI
        var isChordTone = /<chord\s*\/>/.test(noteXml);
        var step = textOf(noteXml, 'step');
        var alter = textOf(noteXml, 'alter');
        var octave = textOf(noteXml, 'octave');

        var noteName = null;
        if (!isRest && step) {
            var accidental = '';
            if (Number(alter) > 0) accidental = '#';
            if (Number(alter) < 0) accidental = 'b';
            noteName = step + accidental + octave;
        }

        var timing = parseTiming(noteXml);
        var variant = /sax-fingering-variant=(\d+)/.exec(noteXml);

        var element = {
            isRest: isRest,
            chordTone: isChordTone,
            noteName: noteName,
            displayName: noteName,
            duration: timing.duration,
            dotted: timing.dotted,
            currentVariant: variant ? Number(variant[1]) : 1
        };

        if (timing.tuplet) element.tuplet = timing.tuplet;
        if (/<tie type="start"/.test(noteXml)) element.tiedToNext = true;
        if (/<slur type="start"/.test(noteXml)) element.slurStart = true;
        if (/<slur type="stop"/.test(noteXml)) element.slurEnd = true;

        return element;
    }

    // Список партий файла: имя, программа, сколько нот. Нужен, чтобы предложить
    // выбор, когда в файле больше одного инструмента
    function listParts(xml) {
        var text = String(xml || '');
        var names = {};
        var nameRe = /<score-part\s+id="([^"]*)"[\s\S]*?<part-name[^>]*>([\s\S]*?)<\/part-name>/g;
        var nameMatch;
        while ((nameMatch = nameRe.exec(text))) names[nameMatch[1]] = unescapeXml(nameMatch[2]).trim();

        var programs = {};
        var progRe = /<score-part\s+id="([^"]*)"[\s\S]*?<midi-program>(\d+)<\/midi-program>/g;
        var progMatch;
        while ((progMatch = progRe.exec(text))) programs[progMatch[1]] = Number(progMatch[2]);

        var list = [];
        var partRe = /<part\s+id="([^"]*)"[^>]*>([\s\S]*?)<\/part>/g;
        var partMatch;
        while ((partMatch = partRe.exec(text))) {
            list.push({
                id: partMatch[1],
                name: names[partMatch[1]] || partMatch[1],
                program: programs[partMatch[1]] || null,
                noteCount: (partMatch[2].match(/<note(\s[^>]*)?>/g) || []).length,
                polyphonic: /<backup>/.test(partMatch[2])
            });
        }
        return list;
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
        var partRe = /<part\s+id="([^"]*)"[^>]*>([\s\S]*?)<\/part>/g;
        var parts = [];
        var partMatch;
        while ((partMatch = partRe.exec(text))) parts.push({ id: partMatch[1], body: partMatch[2] });
        if (!parts.length) parts.push({ id: '', body: text });

        var partNames = {};
        var nameRe = /<score-part\s+id="([^"]*)"[\s\S]*?<part-name[^>]*>([\s\S]*?)<\/part-name>/g;
        var nameMatch;
        while ((nameMatch = nameRe.exec(text))) partNames[nameMatch[1]] = unescapeXml(nameMatch[2]).trim();

        var partPrograms = {};
        var progRe = /<score-part\s+id="([^"]*)"[\s\S]*?<midi-program>(\d+)<\/midi-program>/g;
        var progMatch;
        while ((progMatch = progRe.exec(text))) partPrograms[progMatch[1]] = Number(progMatch[2]);

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


        var elements = [];
        var skippedChords = 0;
        var skippedGrace = 0;
        var voices = {};
        var octaveShift = 0;

        // Идём по документу по порядку: знак 8va действует на ноты после себя,
        // поэтому одними нотами не обойтись, нужны и указания
        var scan = /<(note|direction|barline)(\s[^>]*)?>([\s\S]*?)<\/\1>/g;
        var pendingVolta = null;   // номер концовки, объявленной перед нотами
        var pendingRepeat = false; // реприза, объявленная перед нотами
        var item;
        while ((item = scan.exec(body))) {
            var kind = item[1];
            var noteBody = item[3];

            if (kind === 'barline') {
                // Вольта: концовка с номером. Начало помечаем следующей ноте,
                // конец - предыдущей, как это делают нотные редакторы
                var endingMatch = /<ending([^>]*)>/.exec(item[3]);
                if (endingMatch) {
                    var numberMatch = /number="([^"]*)"/.exec(endingMatch[1]);
                    var typeMatch2 = /type="([a-z]+)"/.exec(endingMatch[1]);
                    var endingNumber = numberMatch ? numberMatch[1] : '';
                    var endingType = typeMatch2 ? typeMatch2[1] : '';
                    if (endingType === 'start') pendingVolta = endingNumber;
                    else if (endingType === 'stop' || endingType === 'discontinue') {
                        if (elements.length) elements[elements.length - 1].voltaStop = true;
                    }
                }
                // Репризы: у приложения свои метки на элементах
                if (/<repeat[^>]*direction="backward"/.test(item[3])) {
                    if (elements.length) elements[elements.length - 1].repeatEnd = true;
                }
                if (/<repeat[^>]*direction="forward"/.test(item[3])) {
                    pendingRepeat = true;
                }
                continue;
            }

            if (kind === 'direction') {
                var shiftTag = /<octave-shift[^>]*>/.exec(noteBody);
                if (shiftTag) {
                    var typeMatch = /type="([a-z]+)"/.exec(shiftTag[0]);
                    var sizeMatch = /size="(\d+)"/.exec(shiftTag[0]);
                    var steps = 12;
                    if (sizeMatch && Number(sizeMatch[1]) === 15) steps = 24;
                    if (sizeMatch && Number(sizeMatch[1]) === 22) steps = 36;
                    var shiftType = typeMatch ? typeMatch[1] : '';
                    if (shiftType === 'up') octaveShift = steps;
                    else if (shiftType === 'down') octaveShift = -steps;
                    else if (shiftType === 'stop') octaveShift = 0;
                    // continue значит знак тянется на следующую строку: оставляем
                }
                continue;
            }

            var element = parseNote(noteBody);

            // Аккорд: приложение одноголосное, и для саксофона нужна верхняя
            // линия, поэтому из тонов аккорда оставляем самый высокий
            if (element.chordTone) {
                skippedChords++;
                var previousNote = elements[elements.length - 1];
                if (previousNote && !previousNote.isRest) {
                    var wasPitch = pitchNumber(previousNote.noteName);
                    var nowPitch = pitchNumber(element.noteName);
                    if (wasPitch !== null && nowPitch !== null && nowPitch > wasPitch) {
                        elements[elements.length - 1] = element;
                    }
                }
                continue;
            }
            // Форшлаг длительности не имеет: полной нотой он сдвинул бы такт
            if (/<grace\s*\/>/.test(noteBody)) { skippedGrace++; continue; }
            // Ноту без высоты, которую мы не понимаем, лучше пропустить
            if (!element.isRest && !element.noteName) continue;

            // 8va и 8vb: ноты записаны условно, звучат на октаву выше или ниже
            if (octaveShift && element.noteName) {
                var pitch = pitchOf(element.noteName);
                if (pitch) {
                    var accidental = pitch.alter > 0 ? '#' : (pitch.alter < 0 ? 'b' : '');
                    element.noteName = pitch.step + accidental + (pitch.octave + octaveShift / 12);
                    element.displayName = element.noteName;
                }
            }

            if (pendingVolta) {
                element.voltaStart = pendingVolta;
                pendingVolta = null;
            }
            if (pendingRepeat) {
                element.repeatStart = true;
                pendingRepeat = false;
            }

            var voiceMatch = /<voice>([^<]+)<\/voice>/.exec(noteBody);
            var voiceNumber = voiceMatch ? voiceMatch[1].trim() : '1';
            voices[voiceNumber] = (voices[voiceNumber] || 0) + 1;
            element.voice = voiceNumber;
            elements.push(element);
        }

        // Несколько голосов: берём тот, где больше нот, как верхнюю линию.
        // Иначе многоголосие склеилось бы в кашу
        var voiceKeys = Object.keys(voices);
        var mainVoice = '';
        voiceKeys.forEach(function (key) {
            if (!mainVoice || voices[key] > voices[mainVoice]) mainVoice = key;
        });
        var droppedVoices = 0;
        if (voiceKeys.length > 1) {
            var beforeFilter = elements.length;
            elements = elements.filter(function (element) { return element.voice === mainVoice; });
            droppedVoices = beforeFilter - elements.length;
        }
        elements.forEach(function (element) { delete element.voice; });

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
            settings: settings,
            meta: meta
        };
    }

    return {
        DIVISIONS: DIVISIONS,
        build: build,
        parse: parse,
        listParts: listParts,
        beatsOf: beatsOf,
        pitchOf: pitchOf
    };
});
