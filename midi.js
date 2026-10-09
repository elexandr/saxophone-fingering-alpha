// Разбор MIDI-файлов (Standard MIDI File) и преобразование в ноты приложения.
// Внешних библиотек нет: формат разбирается вручную.
//
// Две части:
//   parse(buffer)      - разбор файла: события, темп, размер, ноты в тиках
//   toElements(data)   - преобразование в элементы приложения:
//                        { isRest, noteName, duration, dotted }
(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.Midi = factory();
    }
}(typeof window !== 'undefined' ? window : this, function () {
    'use strict';

    // Диапазон саксофона в приложении: C2..A5
    var RANGE_MIN_MIDI = 36; // C2
    var RANGE_MAX_MIDI = 90; // F#6

    // Что умеет приложение: длительность (знаменатель) и точка.
    // beats - сколько четвертей занимает элемент.
    var ALLOWED = [
        { beats: 4, duration: 1, dotted: false },
        { beats: 3, duration: 2, dotted: true },
        { beats: 2, duration: 2, dotted: false },
        { beats: 1.5, duration: 4, dotted: true },
        { beats: 1, duration: 4, dotted: false },
        { beats: 0.75, duration: 8, dotted: true },
        { beats: 0.5, duration: 8, dotted: false },
        { beats: 0.375, duration: 16, dotted: true },
        { beats: 0.25, duration: 16, dotted: false }
    ];

    // Шаг сетки: тридцатьвторая. Нужен, чтобы помещались ноты с точкой (0.375)
    var GRID = 0.125;

    var SEMITONES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

    var META = {
        sequenceNumber: 0x00,
        text: 0x01,
        copyright: 0x02,
        trackName: 0x03,
        instrumentName: 0x04,
        lyric: 0x05,
        marker: 0x06,
        cuePoint: 0x07,
        channelPrefix: 0x20,
        port: 0x21,
        endOfTrack: 0x2f,
        tempo: 0x51,
        smpteOffset: 0x54,
        timeSignature: 0x58,
        keySignature: 0x59,
        sequencerSpecific: 0x7f
    };

    // --- чтение байтов -----------------------------------------------------

    function readUint16(bytes, pos) {
        return (bytes[pos] << 8) | bytes[pos + 1];
    }

    function readUint32(bytes, pos) {
        return ((bytes[pos] << 24) | (bytes[pos + 1] << 16) |
            (bytes[pos + 2] << 8) | bytes[pos + 3]) >>> 0;
    }

    function readAscii(bytes, pos, length) {
        var text = '';
        for (var i = 0; i < length; i++) {
            text += String.fromCharCode(bytes[pos + i]);
        }
        return text;
    }

    // Переменная длина: до 4 байт, старший бит - признак продолжения
    function readVarLength(bytes, pos) {
        var value = 0;
        var read = 0;
        while (pos + read < bytes.length && read < 4) {
            var byte = bytes[pos + read];
            read++;
            value = (value << 7) | (byte & 0x7f);
            if ((byte & 0x80) === 0) break;
        }
        return { value: value, next: pos + read };
    }

    function toBytes(buffer) {
        if (buffer instanceof Uint8Array) return buffer;
        if (buffer instanceof ArrayBuffer) return new Uint8Array(buffer);
        if (buffer && buffer.buffer instanceof ArrayBuffer) {
            return new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
        }
        return null;
    }

    // --- разбор файла ------------------------------------------------------

    function parse(buffer) {
        var bytes = toBytes(buffer);
        var errors = [];

        if (!bytes || bytes.length < 14) {
            return { ok: false, errors: ['Файл слишком короткий для MIDI'], notes: [] };
        }

        if (readAscii(bytes, 0, 4) !== 'MThd') {
            return { ok: false, errors: ['Это не MIDI-файл: нет заголовка MThd'], notes: [] };
        }

        var headerLength = readUint32(bytes, 4);
        var format = readUint16(bytes, 8);
        var trackCount = readUint16(bytes, 10);
        var division = readUint16(bytes, 12);

        if (division & 0x8000) {
            errors.push('Файл задаёт время в кадрах SMPTE - такой формат не поддерживается');
            return { ok: false, errors: errors, notes: [] };
        }

        var ppq = division || 480;
        var pos = 8 + headerLength;
        var tracks = [];
        var tempoBpm = null;
        var timeSignature = null;

        for (var t = 0; t < trackCount && pos + 8 <= bytes.length; t++) {
            var chunkId = readAscii(bytes, pos, 4);
            var chunkLength = readUint32(bytes, pos + 4);
            var body = pos + 8;

            if (chunkId !== 'MTrk') {
                // Незнакомый блок пропускаем целиком
                errors.push('Пропущен неизвестный блок ' + chunkId);
                pos = body + chunkLength;
                t--;
                continue;
            }

            var end = Math.min(body + chunkLength, bytes.length);
            var track = readTrack(bytes, body, end, ppq, errors);

            if (tempoBpm === null && track.tempoBpm) tempoBpm = track.tempoBpm;
            if (timeSignature === null && track.timeSignature) timeSignature = track.timeSignature;

            tracks.push(track.notes);
            pos = body + chunkLength;
        }

        var notes = [];
        tracks.forEach(function (list) {
            notes = notes.concat(list);
        });

        notes.sort(function (a, b) {
            return a.startTick - b.startTick || a.midi - b.midi;
        });

        return {
            // ok - файл разобран. Нот может и не быть: это не ошибка разбора,
            // о пустом файле приложение скажет отдельно
            ok: true,
            format: format,
            ppq: ppq,
            trackCount: tracks.length,
            tempoBpm: tempoBpm,
            timeSignature: timeSignature,
            notes: notes,
            errors: errors
        };
    }

    function readTrack(bytes, start, end, ppq, errors) {
        var notes = [];
        var sounding = {};      // нота -> очередь начал (одна и та же нота может звучать дважды)
        var pos = start;
        var tick = 0;
        var runningStatus = null;
        var tempoBpm = null;
        var timeSignature = null;
        var lastTick = 0;

        while (pos < end) {
            var delta = readVarLength(bytes, pos);
            tick += delta.value;
            pos = delta.next;
            if (pos >= end) break;

            var status = bytes[pos];

            if (status === 0xff) {
                pos++;
                var metaType = bytes[pos];
                pos++;
                var metaLength = readVarLength(bytes, pos);
                pos = metaLength.next;
                var metaEnd = pos + metaLength.value;

                if (metaType === META.tempo && metaLength.value >= 3) {
                    var microPerQuarter = (bytes[pos] << 16) | (bytes[pos + 1] << 8) | bytes[pos + 2];
                    if (microPerQuarter > 0 && tempoBpm === null) {
                        tempoBpm = Math.round(60000000 / microPerQuarter);
                    }
                } else if (metaType === META.timeSignature && metaLength.value >= 2) {
                    if (timeSignature === null) {
                        timeSignature = {
                            numerator: bytes[pos],
                            denominator: Math.pow(2, bytes[pos + 1])
                        };
                    }
                } else if (metaType === META.endOfTrack) {
                    lastTick = Math.max(lastTick, tick);
                    pos = metaEnd;
                    break;
                }

                pos = metaEnd;
                continue;
            }

            if (status === 0xf0 || status === 0xf7) {
                // SysEx: дальше идёт длина и данные
                pos++;
                var sysexLength = readVarLength(bytes, pos);
                pos = sysexLength.next + sysexLength.value;
                continue;
            }

            if (status & 0x80) {
                runningStatus = status;
                pos++;
            } else if (runningStatus === null) {
                errors.push('Битый поток событий: нет статуса');
                break;
            } else {
                status = runningStatus;
            }

            var command = status & 0xf0;
            var channel = status & 0x0f;

            if (command === 0x90 || command === 0x80) {
                var noteNumber = bytes[pos];
                var velocity = bytes[pos + 1];
                pos += 2;

                if (command === 0x90 && velocity > 0) {
                    if (!sounding[noteNumber]) sounding[noteNumber] = [];
                    sounding[noteNumber].push(tick);
                } else {
                    var queue = sounding[noteNumber];
                    if (queue && queue.length) {
                        var startTick = queue.shift();
                        if (tick > startTick) {
                            notes.push({
                                midi: noteNumber,
                                startTick: startTick,
                                durationTicks: tick - startTick,
                                channel: channel
                            });
                        }
                    }
                }
                lastTick = Math.max(lastTick, tick);
                continue;
            }

            if (command === 0xa0 || command === 0xb0 || command === 0xe0) {
                pos += 2; // двеデータバイト
                continue;
            }

            if (command === 0xc0 || command === 0xd0) {
                pos += 1; // один байт
                continue;
            }

            errors.push('Неизвестная команда 0x' + command.toString(16));
            break;
        }

        // Незакрытые ноты закрываем концом трека
        Object.keys(sounding).forEach(function (key) {
            var queue = sounding[key];
            while (queue && queue.length) {
                var startTick = queue.shift();
                if (lastTick > startTick) {
                    notes.push({
                        midi: parseInt(key, 10),
                        startTick: startTick,
                        durationTicks: lastTick - startTick,
                        channel: 0
                    });
                }
            }
        });

        return { notes: notes, tempoBpm: tempoBpm, timeSignature: timeSignature };
    }

    // --- преобразование в ноты приложения ----------------------------------

    function midiToName(midi) {
        var octave = Math.floor(midi / 12) - 1;
        var semitone = ((midi % 12) + 12) % 12;
        return SEMITONES[semitone] + octave;
    }

    // Полифонию сводим к одной линии: в каждый момент берём самую высокую ноту
    function monophonicSegments(notes) {
        if (!notes.length) return [];

        var points = [];
        notes.forEach(function (note) {
            points.push(note.startTick);
            points.push(note.startTick + note.durationTicks);
        });
        points.sort(function (a, b) { return a - b; });

        var segments = [];
        for (var i = 0; i < points.length - 1; i++) {
            var from = points[i];
            var to = points[i + 1];
            if (to <= from) continue;

            var top = null;
            notes.forEach(function (note) {
                if (note.startTick <= from && note.startTick + note.durationTicks > from) {
                    if (top === null || note.midi > top.midi) top = note;
                }
            });

            if (top === null) continue;

            var last = segments[segments.length - 1];

            // Продлеваем только ту же самую ноту: сравнение по самой ноте, а не
            // по высоте. Иначе повтор одной и той же ноты, который в MIDI идёт
            // встык, склеивается в одну длинную ноту.
            if (last && last.source === top && last.endTick === from) {
                last.endTick = to;
            } else {
                segments.push({
                    midi: top.midi,
                    startTick: from,
                    endTick: to,
                    source: top
                });
            }
        }

        return segments;
    }

    // Подбор слагаемых из разрешённых длительностей.
    // units - длительность в шагах сетки.
    function splitUnits(units) {
        var allowedUnits = ALLOWED.map(function (item) {
            return Math.round(item.beats / GRID);
        });
        var parts = [];
        var left = units;

        while (left > 0) {
            var pick = null;
            for (var i = 0; i < allowedUnits.length; i++) {
                var candidate = allowedUnits[i];
                if (candidate <= left && (left - candidate === 0 || left - candidate >= 2)) {
                    pick = candidate;
                    break;
                }
            }
            if (pick === null) pick = left >= 3 ? 3 : 2;
            parts.push(pick);
            left -= pick;
        }

        return parts;
    }

    function durationForUnits(units) {
        var beats = units * GRID;
        var best = ALLOWED[ALLOWED.length - 1];
        var bestDiff = Infinity;
        ALLOWED.forEach(function (item) {
            var diff = Math.abs(item.beats - beats);
            if (diff < bestDiff) {
                bestDiff = diff;
                best = item;
            }
        });
        return { duration: best.duration, dotted: best.dotted };
    }

    // Саксофон одноголосый, а MIDI бывает многоголосым. Считаем, сколько нот
    // звучит одновременно: если больше одной, файл придётся упрощать,
    // и об этом нужно сказать пользователю, а не делать это молча.
    function analyzePolyphony(notes) {
        var points = [];
        (notes || []).forEach(function (note) {
            points.push({ tick: note.startTick, delta: 1 });
            points.push({ tick: note.startTick + note.durationTicks, delta: -1 });
        });

        // При совпадении тиков сначала закрываем ноты: нота, начавшаяся ровно
        // в момент окончания другой, это не многоголосие
        points.sort(function (a, b) {
            return a.tick - b.tick || a.delta - b.delta;
        });

        var current = 0;
        var maxSimultaneous = 0;
        var polyphonicMoments = 0;
        var i = 0;

        while (i < points.length) {
            var tick = points[i].tick;
            while (i < points.length && points[i].tick === tick) {
                current += points[i].delta;
                i++;
            }
            if (current > maxSimultaneous) maxSimultaneous = current;
            if (current > 1) polyphonicMoments++;
        }

        return {
            noteCount: (notes || []).length,
            maxSimultaneous: maxSimultaneous,
            polyphonicMoments: polyphonicMoments,
            isMonophonic: maxSimultaneous <= 1
        };
    }

    // Подбор сдвига на октавы, чтобы мелодия попала в диапазон саксофона.
    // При равном числе нот в диапазоне выбираем сдвиг поменьше: иначе
    // помещающаяся мелодия молча уезжает на октаву вниз.
    function bestOctaveShift(midiNotes) {
        var bestShift = 0;
        var bestInside = -1;

        for (var shift = -48; shift <= 48; shift += 12) {
            var inside = 0;
            midiNotes.forEach(function (midi) {
                var shifted = midi + shift;
                if (shifted >= RANGE_MIN_MIDI && shifted <= RANGE_MAX_MIDI) inside++;
            });

            var better = inside > bestInside ||
                (inside === bestInside && Math.abs(shift) < Math.abs(bestShift));
            if (better) {
                bestInside = inside;
                bestShift = shift;
            }
        }

        return { shift: bestShift, inside: Math.max(0, bestInside) };
    }

    // data: результат parse(). Возвращает элементы приложения и сведения о переносе.
    function toElements(data, options) {
        options = options || {};
        var shift = options.shift;
        var segments = monophonicSegments(data.notes || []);

        if (shift === undefined || shift === null) {
            shift = bestOctaveShift(segments.map(function (s) { return s.midi; })).shift;
        }

        var ppq = data.ppq || 480;
        var elements = [];
        var polyphony = analyzePolyphony(data.notes || []);
        var stats = {
            notes: 0,
            rests: 0,
            skipped: 0,
            splitNotes: 0,
            lowest: null,
            highest: null,
            polyphony: polyphony
        };

        // Позиция в шагах сетки, чтобы копейки не накапливались
        var cursor = 0;

        function pushRest(units) {
            splitUnits(units).forEach(function (part) {
                var value = durationForUnits(part);
                elements.push({ isRest: true, duration: value.duration, dotted: value.dotted });
                stats.rests++;
            });
        }

        segments.forEach(function (segment) {
            var midi = segment.midi + shift;

            if (midi < RANGE_MIN_MIDI || midi > RANGE_MAX_MIDI) {
                stats.skipped++;
                return;
            }

            var startUnits = Math.round((segment.startTick / ppq) / GRID);
            var lengthUnits = Math.round(((segment.endTick - segment.startTick) / ppq) / GRID);

            if (startUnits > cursor) {
                pushRest(startUnits - cursor);
                cursor = startUnits;
            } else if (startUnits < cursor) {
                startUnits = cursor;
            }

            if (lengthUnits < 2) lengthUnits = 2; // короче шестнадцатой приложение не умеет

            var noteName = midiToName(midi);
            var parts = splitUnits(lengthUnits);

            parts.forEach(function (part) {
                var value = durationForUnits(part);
                elements.push({
                    isRest: false,
                    noteName: noteName,
                    duration: value.duration,
                    dotted: value.dotted
                });
                stats.notes++;
            });

            if (parts.length > 1) stats.splitNotes++;

            if (stats.lowest === null || midi < stats.lowest) stats.lowest = midi;
            if (stats.highest === null || midi > stats.highest) stats.highest = midi;

            cursor = startUnits + lengthUnits;
        });

        var totalBeats = elements.reduce(function (sum, element) {
            var beats = 4 / (element.duration || 4);
            return sum + (element.dotted ? beats * 1.5 : beats);
        }, 0);

        return {
            elements: elements,
            stats: stats,
            shift: shift,
            totalBeats: totalBeats,
            tempoBpm: data.tempoBpm || null,
            timeSignature: data.timeSignature || null
        };
    }

    // Сколько нот мелодии попадёт в диапазон при выбранном сдвиге
    function fitReport(data, shift) {
        var segments = monophonicSegments(data.notes || []);
        var inside = 0;
        segments.forEach(function (segment) {
            var midi = segment.midi + shift;
            if (midi >= RANGE_MIN_MIDI && midi <= RANGE_MAX_MIDI) inside++;
        });
        return { total: segments.length, inside: inside };
    }

    // --- запись файла ------------------------------------------------------
    
    // Разрешение дорожки: 480 тиков на четверть, привычное редакторам
    var TICKS_PER_QUARTER = 480;
    
    // Число переменной длины: по семь бит на байт, старший бит - продолжение
    function writeVlq(value) {
        var bytes = [value & 0x7f];
        var rest = Math.floor(value / 128);
        
        while (rest > 0) {
            bytes.unshift((rest & 0x7f) | 0x80);
            rest = Math.floor(rest / 128);
        }
        
        return bytes;
    }
    
    // Обратное к midiToName: имя ноты приложения в номер MIDI.
    // Нумерация октав та же, поэтому имена сходятся при чтении обратно.
    function nameToMidi(name) {
        var text = String(name === null || name === undefined ? '' : name).trim();
        var match = /^([A-Ga-g])([#b]?)(-?\d+)$/.exec(text);
        if (!match) return null;
        
        var letters = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
        var base = letters[match[1].toUpperCase()];
        if (base === undefined) return null;
        
        var shift = match[2] === '#' ? 1 : (match[2] === 'b' ? -1 : 0);
        return (parseInt(match[3], 10) + 1) * 12 + base + shift;
    }
    
    function asciiBytes(text) {
        var bytes = [];
        for (var i = 0; i < text.length; i++) bytes.push(text.charCodeAt(i) & 0x7f);
        return bytes;
    }
    
    function metaText(text) {
        var bytes = asciiBytes(text);
        return [0xff, 0x03, bytes.length].concat(bytes);
    }
    
    function metaTempo(bpm) {
        var microseconds = Math.round(60000000 / bpm);
        return [0xff, 0x51, 0x03,
            (microseconds >> 16) & 0xff, (microseconds >> 8) & 0xff, microseconds & 0xff];
    }
    
    function metaSignature(signature) {
        var parts = String(signature || '4/4').split('/');
        var numerator = parseInt(parts[0], 10) || 4;
        var denominator = parseInt(parts[1], 10) || 4;
        var power = Math.max(0, Math.min(6, Math.round(Math.log(denominator) / Math.log(2))));
        
        // 0x18 - 24 тика метронома на четверть, 0x08 - восемь тридцатьвторых
        return [0xff, 0x58, 0x04, numerator, power, 0x18, 0x08];
    }
    
    function sizeBytes(length) {
        return [(length >> 24) & 0xff, (length >> 16) & 0xff, (length >> 8) & 0xff, length & 0xff];
    }
    
    // Сборка MIDI-файла. Формат 0, одна дорожка: его читают все музыкальные
    // программы. Саксофонной части в файле нет - MIDI её не хранит.
    // notes: [{ midi, startBeat, beats }]
    function build(data) {
        var source = data || {};
        var notes = source.notes || [];
        var tempo = Math.max(20, Math.min(400, Math.round(source.tempo || 80)));
        var ticks = TICKS_PER_QUARTER;
        
        // На одном тике сначала идут служебные события, потом снятие звука и
        // только затем взятие: иначе две одинаковые ноты подряд слипнутся
        var events = [];
        events.push({ tick: 0, order: -1, bytes: metaText('Saxophone Fingerings') });
        events.push({ tick: 0, order: -1, bytes: metaTempo(tempo) });
        events.push({ tick: 0, order: -1, bytes: metaSignature(source.timeSignature) });
        
        notes.forEach(function (note) {
            var midi = Math.max(0, Math.min(127, Math.round(note.midi)));
            var start = Math.max(0, Math.round((note.startBeat || 0) * ticks));
            var length = Math.max(1, Math.round((note.beats || 1) * ticks));
            
            events.push({ tick: start, order: 1, bytes: [0x90, midi, 100] });
            events.push({ tick: start + length, order: 0, bytes: [0x80, midi, 64] });
        });
        
        events.sort(function (a, b) {
            if (a.tick !== b.tick) return a.tick - b.tick;
            return a.order - b.order;
        });
        
        var track = [];
        var previous = 0;
        
        events.forEach(function (event) {
            track.push.apply(track, writeVlq(event.tick - previous));
            track.push.apply(track, event.bytes);
            previous = event.tick;
        });
        
        track.push(0x00, 0xff, 0x2f, 0x00);
        
        var bytes = [];
        bytes.push.apply(bytes, asciiBytes('MThd'));
        bytes.push.apply(bytes, [0, 0, 0, 6, 0, 0, 0, 1]);
        bytes.push.apply(bytes, [(ticks >> 8) & 0xff, ticks & 0xff]);
        bytes.push.apply(bytes, asciiBytes('MTrk'));
        bytes.push.apply(bytes, sizeBytes(track.length));
        bytes.push.apply(bytes, track);
        
        return bytes;
    }
    
    return {
        parse: parse,
        build: build,
        nameToMidi: nameToMidi,
        writeVlq: writeVlq,
        TICKS_PER_QUARTER: TICKS_PER_QUARTER,
        toElements: toElements,
        monophonicSegments: monophonicSegments,
        analyzePolyphony: analyzePolyphony,
        midiToName: midiToName,
        bestOctaveShift: bestOctaveShift,
        fitReport: fitReport,
        RANGE_MIN_MIDI: RANGE_MIN_MIDI,
        RANGE_MAX_MIDI: RANGE_MAX_MIDI,
        ALLOWED: ALLOWED,
        GRID: GRID
    };
}));
