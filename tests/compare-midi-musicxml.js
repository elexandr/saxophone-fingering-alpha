// Сверка импорта MIDI с эталоном.
//
// Эталон — файл MusicXML, выгруженный из Guitar Pro: в нём та же пьеса
// размечена правильно, с лигами и триолями. Сравниваем такт за тактом,
// ноту за нотой и печатаем расхождения.
//
// Запуск:
//   node tests/compare-midi-musicxml.js <файл.mid> <файл.xml> [имя партии]

var fs = require('fs');
var path = require('path');

var Midi = require(path.join(__dirname, '..', 'midi.js'));

var midPath = process.argv[2];
var xmlPath = process.argv[3];
var wantedPart = (process.argv[4] || 'MELODY').toUpperCase();

if (!midPath || !xmlPath) {
    console.log('укажите файл MIDI и файл MusicXML');
    process.exit(1);
}

// --- эталон из MusicXML ----------------------------------------------------

function readReference(xml, wanted) {
    var names = {};
    var nameRe = /<score-part\s+id="([^"]*)"[\s\S]*?<part-name[^>]*>([\s\S]*?)<\/part-name>/g;
    var m;
    while ((m = nameRe.exec(xml))) names[m[1]] = m[2].trim();

    var partRe = /<part\s+id="([^"]*)"[^>]*>([\s\S]*?)<\/part>/g;
    var body = null;
    var partId = null;
    while ((m = partRe.exec(xml))) {
        if ((names[m[1]] || '').toUpperCase().indexOf(wanted) >= 0) {
            body = m[2];
            partId = m[1];
        }
    }
    if (!body) throw new Error('партия ' + wanted + ' не найдена');

    var measures = body.match(/<measure[^>]*>[\s\S]*?<\/measure>/g) || [];
    var division = 1;
    var beatsPerMeasure = 4;
    var notes = [];
    var measureStart = 0;

    measures.forEach(function (measure, index) {
        var div = /<divisions>(\d+)<\/divisions>/.exec(measure);
        if (div) division = Number(div[1]);
        var beats = /<beats>(\d+)<\/beats>/.exec(measure);
        var beatType = /<beat-type>(\d+)<\/beat-type>/.exec(measure);
        if (beats && beatType) beatsPerMeasure = Number(beats[1]) * (4 / Number(beatType[1]));

        // Голоса: мелодия обычно в первом. Полнотактные паузы других голосов
        // в запись не идут, иначе такт считается дважды
        var voiceCount = {};
        var noteRe = /<note[\s>][\s\S]*?<\/note>/g;
        var n;
        while ((n = noteRe.exec(measure))) {
            var v = /<voice>([^<]+)<\/voice>/.exec(n[0]);
            var key = v ? v[1].trim() : '1';
            voiceCount[key] = (voiceCount[key] || 0) + 1;
        }
        var mainVoice = '';
        Object.keys(voiceCount).forEach(function (key) {
            if (!mainVoice || voiceCount[key] > voiceCount[mainVoice]) mainVoice = key;
        });

        var cursor = measureStart;
        var measureEnd = measureStart;
        noteRe.lastIndex = 0;
        while ((n = noteRe.exec(measure))) {
            var item = n[0];
            var v2 = /<voice>([^<]+)<\/voice>/.exec(item);
            var voice = v2 ? v2[1].trim() : '1';
            if (voice !== mainVoice) continue;

            var ticks = Number((/<duration>(\d+)<\/duration>/.exec(item) || [])[1] || 0);
            var len = ticks / division;
            var isRest = /<rest\s*\/>/.test(item);
            var isChord = /<chord\s*\/>/.test(item);
            var step = (/<step>([^<]*)<\/step>/.exec(item) || [])[1] || '';
            var alter = Number((/<alter>([^<]*)<\/alter>/.exec(item) || [])[1] || 0);
            var octave = (/<octave>([^<]*)<\/octave>/.exec(item) || [])[1] || '';
            var name = step + (alter > 0 ? '#' : alter < 0 ? 'b' : '') + octave;

            if (!isChord && !isRest) {
                notes.push({
                    beat: cursor,
                    len: len,
                    name: name,
                    tie: /<tie type="start"/.test(item),
                    tuplet: /<time-modification>/.test(item),
                    bar: index + 1
                });
            }
            cursor += len;
            if (cursor > measureEnd) measureEnd = cursor;
        }

        // Длину такта берём по размеру, а не по последней ноте: в такте бывают паузы
        measureStart += beatsPerMeasure;
    });

    return { notes: notes, measures: measures.length, part: partId, beatsPerMeasure: beatsPerMeasure };
}

// --- мой импорт MIDI -------------------------------------------------------

function readMine(midPath, wanted) {
    var buffer = fs.readFileSync(midPath);
    var parsed = Midi.parse(buffer);
    var track = null;
    (parsed.tracks || []).forEach(function (item) {
        if ((item.name || '').toUpperCase().indexOf(wanted) >= 0) track = item;
    });
    if (!track) throw new Error('дорожка ' + wanted + ' не найдена в MIDI');

    var ppq = parsed.ppq || 480;
    var converted = Midi.toElements({ notes: track.notes, ppq: ppq });
    var notes = [];
    var beat = 0;
    var bar = 1;
    var beatsPerMeasure = 4;
    if (parsed.timeSignature) {
        beatsPerMeasure = parsed.timeSignature.numerator * (4 / parsed.timeSignature.denominator);
    }
    converted.elements.forEach(function (element) {
        var len = 0;
        var beats = 4 / (element.duration || 4);
        var dots = element.dotted || 0;
        if (dots > 0) beats += beats / 2;
        if (dots > 1) beats += beats / 4;
        if (dots > 2) beats += beats / 8;
        if (element.tuplet) beats = beats * (element.tuplet.normal / element.tuplet.actual);
        len = beats;

        if (!element.isRest) {
            notes.push({
                beat: beat,
                len: len,
                name: element.noteName,
                tie: !!element.tiedToNext,
                tuplet: !!element.tuplet,
                bar: Math.floor(beat / beatsPerMeasure) + 1
            });
        }
        beat += len;
    });
    return { notes: notes, beatsPerMeasure: beatsPerMeasure, ppq: ppq };
}

// --- сверка ----------------------------------------------------------------

var xml = fs.readFileSync(xmlPath, 'utf8');
var reference = readReference(xml, wantedPart);
var mine = readMine(midPath, wantedPart);

console.log('эталон: MusicXML, партия ' + reference.part + ' (' + wantedPart + '), тактов ' + reference.measures);
console.log('моё:    MIDI, дорожка ' + wantedPart + ', нот ' + mine.notes.length +
    ' (в эталоне ' + reference.notes.length + ')');
console.log('размер такта: ' + reference.beatsPerMeasure + '/4' +
    (Math.abs(reference.beatsPerMeasure - mine.beatsPerMeasure) < 0.001 ? ' — совпадает' : ' — РАСХОДИТСЯ'));
console.log('');

var TOL = 0.02;
var bars = {};
reference.notes.forEach(function (n) { bars[n.bar] = true; });
mine.notes.forEach(function (n) { bars[n.bar] = true; });

var badBars = 0;
var totalBad = 0;
Object.keys(bars).map(Number).sort(function (a, b) { return a - b; }).forEach(function (bar) {
    var ref = reference.notes.filter(function (n) { return n.bar === bar; });
    var own = mine.notes.filter(function (n) { return n.bar === bar; });
    // Сопоставляем по высоте и ближайшей позиции, а не по порядку: если нот
    // в такте разное число, сравнение по порядку теряет смысл
    var problems = [];
    var used = [];
    ref.forEach(function (a) {
        var bestIndex = -1;
        var bestDiff = Infinity;
        own.forEach(function (b, index) {
            if (used[index]) return;
            if (b.name !== a.name) return;
            var diff = Math.abs(b.beat - a.beat);
            if (diff < bestDiff) { bestDiff = diff; bestIndex = index; }
        });
        if (bestIndex < 0) {
            problems.push('пропущена нота ' + a.name + ' на ' + a.beat.toFixed(3));
            return;
        }
        used[bestIndex] = true;
        var b = own[bestIndex];
        if (bestDiff > TOL) {
            problems.push('сдвиг ' + (b.beat - a.beat).toFixed(3) + ' на ноте ' + a.name +
                ' (эталон ' + a.beat.toFixed(3) + ', у меня ' + b.beat.toFixed(3) + ')');
        } else if (Math.abs(a.len - b.len) > TOL) {
            problems.push('длина ' + a.name + ' на ' + a.beat.toFixed(3) + ': эталон ' + a.len.toFixed(3) +
                ', у меня ' + b.len.toFixed(3));
        } else if (a.tie !== b.tie) {
            problems.push('лига у ' + a.name + ' на ' + a.beat.toFixed(3) + ': эталон ' +
                (a.tie ? 'есть' : 'нет') + ', у меня ' + (b.tie ? 'есть' : 'нет'));
        }
    });
    own.forEach(function (b, index) {
        if (!used[index]) problems.push('лишняя нота ' + b.name + ' на ' + b.beat.toFixed(3));
    });
    if (problems.length) {
        badBars++;
        totalBad += problems.length;
        if (badBars <= 12) {
            console.log('такт ' + bar + ': ' + problems.slice(0, 4).join('; '));
        }
    }
});

console.log('');
console.log('итого: тактов с расхождением ' + badBars + ' из ' + Object.keys(bars).length +
    ', замечаний ' + totalBad);
