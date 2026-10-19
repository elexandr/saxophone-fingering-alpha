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
    // Сетка импорта: 1/120 доли. Делится и на 3, и на 5, поэтому
    // триоли и квинтоли из чужого MIDI ложатся точно, без сдвига
    var GRID = 1 / 120;

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
        for (var i = 0; i < length; i++) text += String.fromCharCode(bytes[pos + i]);

        // Названия дорожек часто записаны в UTF-8: без этого русские
        // имена превращаются в мусор
        if (typeof TextDecoder !== 'undefined') {
            try {
                return new TextDecoder('utf-8', { fatal: true }).decode(bytes.slice(pos, pos + length));
            } catch (error) { /* не UTF-8: оставляем как есть */ }
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
        var programs = {};
        var trackName = '';
        var trackInfos = [];
        var programs = {};
        var trackName = '';
        var trackInfos = [];

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
            // Инструменты каналов и название дорожки: по ним назовём инструмент
            if (track.programs) {
                Object.keys(track.programs).forEach(function (ch) { programs[ch] = track.programs[ch]; });
            }
            if (!trackName && track.trackName) trackName = track.trackName;

            // Каждая дорожка отдельно: у неё своё имя и свой инструмент,
            // именно это показывает Guitar Pro в списке дорожек
            trackInfos.push({
                name: track.trackName || '',
                programs: track.programs || {},
                tempoBpm: track.tempoBpm || 0,
                notes: track.notes || []
            });

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
            programs: programs,
            tracks: trackInfos,
            trackName: trackName,
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
        var programs = {};
        var trackName = '';
        var trackInfos = [];
        var programs = {};
        var trackName = '';
        var trackInfos = [];
        var programs = {};
        var trackName = '';
        var trackInfos = [];
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
                } else if (metaType === META.trackName && metaLength.value > 0) {
            trackName = readAscii(bytes, pos, metaLength.value);
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
                // Смена инструмента: запоминаем программу канала, по ней
                // и назовём инструмент в списке выбора
                if (command === 0xc0) programs[channel] = bytes[pos];
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

        return {
            notes: notes,
            tempoBpm: tempoBpm,
            timeSignature: timeSignature,
            programs: programs,
            tracks: trackInfos,
            trackName: trackName,
            programs: programs,
            tracks: trackInfos,
            trackName: trackName
        };
    }

    // --- преобразование в ноты приложения ----------------------------------

    // Названия инструментов General MIDI: нужны, чтобы в списке выбора
    // стояло имя инструмента, а не номер канала. Порядок строго по стандарту
    var GM_NAMES = ['Рояль','Яркий рояль','Электророяль','Хонки-тонк','Электропиано 1','Электропиано 2','Клавесин','Клавинет','Челеста','Колокольчики','Музыкальная шкатулка','Вибрафон','Маримба','Ксилофон','Трубчатые колокола','Дульцимер','Орган','Орган Хаммонда','Орган рок','Церковный орган','Язычковый орган','Аккордеон','Губная гармоника','Танго-аккордеон','Гитара нейлон','Гитара сталь','Гитара джаз','Гитара чистая','Гитара с перегрузом','Гитара с приглушением','Гитара флажолет','Гитара 2','Бас','Бас медиатор','Бас слэп','Бас 1','Бас 2','Бас смычок','Бас тремоло','Бас флажолет','Скрипка','Альт','Виолончель','Контрабас','Тремоло-струнные','Пиццикато','Арфа','Литавры','Струнные 1','Струнные 2','Синтезаторные струнные 1','Синтезаторные струнные 2','Хор','Голос','Синтезаторный хор','Удар смычком','Труба','Тромбон','Туба','Труба с сурдиной','Валторна','Медные','Синтезаторные медные 1','Синтезаторные медные 2','Саксофон сопрановый','Саксофон альтовый','Саксофон теноровый','Саксофон баритоновый','Гобой','Английский рожок','Фагот','Кларнет','Флейта пикколо','Флейта','Блокфлейта','Флейта Пана','Бутылочная флейта','Сякухати','Свисток','Окарина','Лид 1','Лид 2','Лид 3','Лид 4','Лид 5','Лид 6','Лид 7','Лид 8','Пэд 1','Пэд 2','Пэд 3','Пэд 4','Пэд 5','Пэд 6','Пэд 7','Пэд 8','Эффекты 1','Эффекты 2','Эффекты 3','Эффекты 4','Эффекты 5','Эффекты 6','Эффекты 7','Эффекты 8','Ситар','Банджо','Сямисэн','Кото','Калимба','Волынка','Скрипка народная','Шанай','Колокольчики перкуссия','Агора','Стальные барабаны','Деревянный блок','Тайко','Мелодичные томы','Синтетические томы','Обратные тарелки','Писк','Смычок','Шум','Гром','Голос-эффект','Отражение','Космос','Взрыв'];
    function instrumentName(program) {
        var index = Number(program);
        if (isNaN(index) || index < 0 || index >= GM_NAMES.length) return '';
        return GM_NAMES[index];
    }

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
    // Обычные длительности в шагах сетки 1/120: целая, половинная и так далее
    // с точками. Всё, что сюда не попадает, - триоль или квинтоль
    var PLAIN_UNITS = (function () {
        var list = [];
        [1, 2, 4, 8, 16, 32].forEach(function (den) {
            var base = 480 / den;
            list.push(base, base * 1.5, base * 1.75, base * 1.875);
        });
        return list;
    })();

    function isPlainUnits(units) {
        return PLAIN_UNITS.some(function (value) { return Math.abs(value - units) < 0.01; });
    }

    // Если длина не обычная, но от неё получается обычная умножением,
    // значит это группа: триоль 3:2 или квинтоль 5:4
    function tupletForUnits(units) {
        var candidates = [
            { mul: 3, div: 2, actual: 3, normal: 2 },
            { mul: 5, div: 4, actual: 5, normal: 4 }
        ];
        for (var i = 0; i < candidates.length; i++) {
            var ratio = candidates[i];
            var plain = units * ratio.mul / ratio.div;
            if (isPlainUnits(plain)) {
                return { actual: ratio.actual, normal: ratio.normal, plainUnits: Math.round(plain) };
            }
        }
        return null;
    }

    // Преобразование нот MIDI в ноты приложения.
    //
    // Порядок взят из того, как это делают нотные редакторы:
    //   1. наложения нот обрезаются по началу следующей;
    //   2. многоголосие сводится к верхней линии;
    //   3. начала нот ложатся на сетку в 12 шагов на четверть - она общая
    //      для обычных долей (2, 4), точек и триолей (3);
    //   4. запись строится по тактам слева направо: пауза до ноты, затем
    //      нота, разложенная на выражаемые длительности;
    //   5. длина до следующего начала сначала набирается обычными
    //      длительностями (самая большая, что влезает), остаток - триольными;
    //   6. что не влезло в такт - переносится за черту и связывается лигой.
    function toElements(data, options) {
        options = options || {};
        var shift = options.shift;
        var ppq = data.ppq || 480;

        // 1. Обрезка наложений
        var sourceNotes = (data.notes || []).slice().sort(function (a, b) {
            return a.startTick - b.startTick;
        });
        var onsets = {};
        sourceNotes.forEach(function (note) { onsets[note.startTick] = true; });
        for (var i = 0; i + 1 < sourceNotes.length; i++) {
            var current = sourceNotes[i];
            var following = sourceNotes[i + 1];
            if (following.startTick > current.startTick &&
                following.startTick < current.startTick + current.durationTicks) {
                current.durationTicks = following.startTick - current.startTick;
            }
        }

        // 2. Одна линия: верхняя нота в каждый момент, разрывы от наложений
        // склеиваем, а повторные начала - нет
        var segments = monophonicSegments(sourceNotes);
        var merged = [];
        segments.forEach(function (segment) {
            var last = merged[merged.length - 1];
            var boundary = last && Math.abs(last.endTick - segment.startTick) < 2;
            if (last && last.midi === segment.midi && boundary && !onsets[segment.startTick]) {
                last.endTick = segment.endTick;
                return;
            }
            merged.push({ midi: segment.midi, startTick: segment.startTick, endTick: segment.endTick });
        });
        segments = merged;

        // Сдвиг октавы: сам выбираем, если не задан
        if (shift === undefined || shift === null) {
            shift = bestOctaveShift(segments.map(function (item) { return item.midi; })).shift;
        }

        // 3. Сетка нотной записи
        var STEPS = 12;
        var stepTicks = ppq / STEPS;
        var measureSteps = 4 * STEPS;

        var NOTATION = [];
        [[1, 0], [2, 1], [4, 2], [8, 3], [16, 4], [32, 5]].forEach(function (pair) {
            var denominator = pair[0];
            var base = 4 * STEPS / denominator;
            var variants = [
                { factor: 1, dots: 0 },
                { factor: 1.5, dots: 1 },
                { factor: 2 / 3, dots: 0, tuplet: { actual: 3, normal: 2 } }
            ];
            variants.forEach(function (variant) {
                var size = base * variant.factor;
                var rounded = Math.round(size);
                if (rounded < 1 || Math.abs(size - rounded) > 0.001) return;
                NOTATION.push({
                    steps: rounded,
                    duration: denominator,
                    dotted: variant.dots,
                    tuplet: variant.tuplet || null
                });
            });
        });
        NOTATION.sort(function (a, b) { return b.steps - a.steps; });
        var plain = NOTATION.filter(function (item) { return !item.tuplet; });
        var ternary = NOTATION.filter(function (item) { return !!item.tuplet; });

        // Выбор длительности для куска:
        //   - если место точно совпадает с записываемой длительностью, берём её;
        //   - иначе самое большое значение БЕЗ точки: точка делает длительность
        //     крупнее, и тогда остаток перестаёт укладываться, как в эталоне
        //     (0,8333 должно дать восьмую 0,5 и триольную восьмую 0,333, а не
        //     восьмую с точкой 0,75 и триольную 32-ю 0,083)
        // Выбор длительности для куска. Правило взято из midi2ly (LilyPond):
        //   - точное совпадение с обычной длительностью берём как есть,
        //     включая точку;
        //   - ПЕРВЫЙ кусок ноты берём обычной длительностью БЕЗ ТОЧКИ: так
        //     0,8333 выходит как восьмая 0,5 и триольная восьмая 0,333,
        //     а не как восьмая с точкой 0,75 плюс остаток;
        //   - остаток — самое большое, что влезает, обычное или триольное.
        function pick(room, untilBar, isFirstPiece) {
            var limit = Math.min(room, untilBar);
            if (limit < 1) return null;

            // Точное совпадение берём целиком. Но НА ДОЛЕ триольное не берём:
            // там эталон ставит обычную длительность, а остаток добирает
            // триолью — 0,667 выходит как восьмая 0,5 и триольная 16-я 0,167,
            // а не как одна триольная четверть. Между долями берём любое:
            // там длительность обязана дойти ровно до границы
            var i;
            var onBeat = (position % STEPS === 0);
            for (i = 0; i < NOTATION.length; i++) {
                if (NOTATION[i].steps !== limit) continue;
                if (onBeat && NOTATION[i].tuplet) continue;
                return NOTATION[i];
            }

            var plain = null;
            if (isFirstPiece) {
                for (i = 0; i < NOTATION.length; i++) {
                    var item = NOTATION[i];
                    if (item.tuplet || item.dotted) continue;
                    if (item.steps > limit) continue;
                    if (!plain || item.steps > plain.steps) plain = item;
                }
                if (plain) return plain;
            }

            var best = null;
            for (i = 0; i < NOTATION.length; i++) {
                var value = NOTATION[i];
                if (value.dotted || value.steps > limit) continue;
                if (!best || value.steps > best.steps) best = value;
            }
            return best;
        }

        var elements = [];
        var stats = {
            notes: 0,
            rests: 0,
            skipped: 0,
            splitNotes: 0,
            tuplets: 0,
            lowest: null,
            highest: null,
            polyphony: analyzePolyphony(data.notes || [])
        };

        // Приложение хранит одну точку как true, две и три - числом
        function dotsValue(count) {
            if (!count) return 0;
            if (count === 1) return true;
            return count;
        }

        var position = 0;

        function stepsOf(tick) {
            return Math.round(tick / stepTicks);
        }

        // Граница куска. С доли можно тянуть до такта; между долями — только
        // до следующей доли. Эталон Guitar Pro режет именно так: нота,
        // начавшаяся между долями, сначала доходит до доли
        function barEndFrom(at) {
            if (at % STEPS === 0) {
                return (Math.floor(at / measureSteps) + 1) * measureSteps;
            }
            return (Math.floor(at / STEPS) + 1) * STEPS;
        }

        segments.forEach(function (segment) {
            var midi = segment.midi + shift;
            if (midi < RANGE_MIN_MIDI || midi > RANGE_MAX_MIDI) {
                stats.skipped++;
                return;
            }

            var startStep = stepsOf(segment.startTick);
            var endStep = stepsOf(segment.endTick);
            if (endStep <= startStep) endStep = startStep + 1;

            // Пауза до точного начала ноты
            var guard = 0;
            while (position < startStep && guard++ < 128) {
                var barEnd = barEndFrom(position);
                var value = pick(startStep - position, barEnd - position);
                if (!value) break;
                elements.push({
                    isRest: true,
                    duration: value.duration,
                    dotted: dotsValue(value.dotted),
                    tuplet: value.tuplet
                });
                stats.rests++;
                position += value.steps;
            }
            if (position < startStep) position = startStep;

            var noteName = midiToName(midi);
            guard = 0;
            while (position < endStep && guard++ < 64) {
                var limit = Math.min(endStep, barEndFrom(position));
                var piece = pick(limit - position, barEndFrom(position) - position, position === startStep);
                if (!piece) break;
                var isLast = position + piece.steps >= endStep;
                elements.push({
                    isRest: false,
                    noteName: noteName,
                    duration: piece.duration,
                    dotted: dotsValue(piece.dotted),
                    tuplet: piece.tuplet,
                    // Продолжение той же ноты связываем лигой
                    tiedToNext: !isLast
                });
                stats.notes++;
                if (piece.tuplet) stats.tuplets++;
                if (!isLast) stats.splitNotes++;
                position += piece.steps;
            }
            if (position < endStep) position = endStep;

            if (stats.lowest === null || midi < stats.lowest) stats.lowest = midi;
            if (stats.highest === null || midi > stats.highest) stats.highest = midi;
        });

        var totalBeats = elements.reduce(function (sum, element) {
            var beats = 4 / (element.duration || 4);
            var dots = element.dotted || 0;
            if (dots > 0) beats += beats / 2;
            if (dots > 1) beats += beats / 4;
            if (dots > 2) beats += beats / 8;
            if (element.tuplet) beats = beats * (element.tuplet.normal / element.tuplet.actual);
            return sum + beats;
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
        // Ноты записи могут накладываться: обрезаем каждую по началу следующей.
        // Иначе сведение в одну линию режет по всем границам сразу, и получаются
        // лишние ноты, паузы не на своих местах и потерянные триоли
        var sourceNotes = (data.notes || []).slice().sort(function (a, b) {
            return a.startTick - b.startTick;
        });
        for (var index = 0; index + 1 < sourceNotes.length; index++) {
            var current = sourceNotes[index];
            var following = sourceNotes[index + 1];
            if (following.startTick > current.startTick &&
                following.startTick < current.startTick + current.durationTicks) {
                current.durationTicks = following.startTick - current.startTick;
            }
        }

        var segments = monophonicSegments(sourceNotes);
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
        instrumentName: instrumentName,
        bestOctaveShift: bestOctaveShift,
        fitReport: fitReport,
        RANGE_MIN_MIDI: RANGE_MIN_MIDI,
        RANGE_MAX_MIDI: RANGE_MAX_MIDI,
        ALLOWED: ALLOWED,
        GRID: GRID
    };
}));