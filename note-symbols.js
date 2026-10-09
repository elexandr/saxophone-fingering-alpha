// Saxophone Fingering Assistant - отрисовка нотных знаков средствами SVG
// Длительности кодируются знаменателем: 1 = целая, 2 = половинная,
// 4 = четвертная, 8 = восьмая, 16 = шестнадцатая.
// Модуль не зависит от DOM: возвращает строки разметки и работает и в браузере, и в Node.

(function (root, factory) {
    var api = factory();
    if (typeof module === 'object' && module.exports) {
        module.exports = api;
    } else {
        root.NoteSymbols = api;
    }
}(typeof window !== 'undefined' ? window : this, function () {
    'use strict';

    var DURATIONS = [
        { value: 1, label: 'целая', short: '1' },
        { value: 2, label: 'половинная', short: '2' },
        { value: 4, label: 'четвертная', short: '4' },
        { value: 8, label: 'восьмая', short: '8' },
        { value: 16, label: 'шестнадцатая', short: '16' }
    ];

    // Кадр глифа: начало координат совпадает с центром головки (или с серединой паузы).
    // Родительский элемент - точка нулевого размера, поэтому кадр задаёт смещение картинки.
    var FRAME = { x: -30, y: -50, width: 60, height: 100 };

    var HEAD_RX = 8;
    var HEAD_RY = 6;
    var STEM_LENGTH = 44;
    var DOT_RADIUS = 2.3;

    function durationInfo(value) {
        for (var i = 0; i < DURATIONS.length; i++) {
            if (DURATIONS[i].value === value) return DURATIONS[i];
        }
        return DURATIONS[2]; // четвертная по умолчанию
    }

    function isHollow(value) {
        return value === 1 || value === 2;
    }

    function flagCount(value) {
        if (value === 8) return 1;
        if (value === 16) return 2;
        return 0;
    }

    // Штиль: у низких нот вверх (справа от головки), у высоких вниз (слева).
    function stemX(stemUp) {
        return stemUp ? HEAD_RX - 1 : -(HEAD_RX - 1);
    }

    function headMarkup(hollow) {
        return '<ellipse class="glyph-head" cx="0" cy="0" rx="' + HEAD_RX + '" ry="' + HEAD_RY +
            '" transform="rotate(-20)" fill="' + (hollow ? '#ffffff' : '#111111') +
            '" stroke="#111111" stroke-width="1.5"/>';
    }

    function stemMarkup(stemUp) {
        var x = stemX(stemUp);
        var y2 = stemUp ? -STEM_LENGTH : STEM_LENGTH;
        return '<line class="glyph-stem" x1="' + x + '" y1="0" x2="' + x + '" y2="' + y2 +
            '" stroke="#111111" stroke-width="1.7" stroke-linecap="round"/>';
    }

    // Флажок висит на конце штиля и загибается вниз (штиль вверх) или вверх (штиль вниз).
    function flagMarkup(stemUp, index) {
        var x = stemX(stemUp);
        var tip = stemUp ? -STEM_LENGTH : STEM_LENGTH;
        var y = tip + (stemUp ? index * 9 : -index * 9);
        var dir = stemUp ? 1 : -1;
        var d = 'M ' + x + ' ' + y +
            ' c 9 ' + (3 * dir) + ', 11 ' + (12 * dir) + ', 7 ' + (20 * dir) +
            ' c -2 ' + (-10 * dir) + ', -4 ' + (-15 * dir) + ', -7 ' + (-18 * dir) + ' z';
        return '<path class="glyph-flag" d="' + d + '" fill="#111111"/>';
    }

    // Точки идут справа от головки друг за другом: их может быть до трёх
    function dotMarkup(count) {
        var total = Math.max(1, Math.min(3, count || 1));
        var markup = '';

        for (var i = 0; i < total; i++) {
            markup += '<circle class="glyph-dot" cx="' + (HEAD_RX + 6 + i * 7) + '" cy="0" r="' + DOT_RADIUS + '" fill="#111111"/>';
        }

        return markup;
    }

    function accidentalMarkup(accidental) {
        if (accidental !== '#' && accidental !== 'b') return '';
        var glyph = accidental === '#' ? '#' : '\u266D';
        return '<text class="glyph-accidental" x="-17" y="5" text-anchor="middle" ' +
            'font-family="Georgia, \'Times New Roman\', serif" font-size="16" fill="#111111">' +
            glyph + '</text>';
    }

    // Невидимая зона захвата клика: сам SVG пропускает события сквозь пустое поле.
    function hitMarkup() {
        // Зона попадания чуть больше головки: по ней проще навести мышь,
        // а размер совпадает с ободком выделения
        return '<circle class="glyph-hit" cx="0" cy="6" r="19" fill="none" pointer-events="all"/>';
    }

    function haloMarkup() {
        return '<circle class="glyph-halo" cx="0" cy="6" r="19" fill="none" ' +
            'stroke="#e53e3e" stroke-width="2.5" opacity="0"/>';
    }

    function wrap(inner) {
        return '<svg class="glyph-svg" width="' + FRAME.width + '" height="' + FRAME.height +
            '" viewBox="' + FRAME.x + ' ' + FRAME.y + ' ' + FRAME.width + ' ' + FRAME.height +
            '" style="left:' + FRAME.x + 'px;top:' + FRAME.y + 'px" ' +
            'xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' + inner + '</svg>';
    }

    // Глиф ноты. options: { duration, dotted, stemUp, accidental }
    function noteSvg(options) {
        options = options || {};
        var duration = durationInfo(options.duration).value;
        var stemUp = options.stemUp !== false;
        var parts = [haloMarkup(), hitMarkup(), accidentalMarkup(options.accidental),
            headMarkup(isHollow(duration))];

        if (duration !== 1) {
            parts.push(stemMarkup(stemUp));
            var count = flagCount(duration);
            for (var i = 0; i < count; i++) {
                parts.push(flagMarkup(stemUp, i));
            }
        }
        var dots = options.dotted === true ? 1 : Math.min(3, Math.max(0, Number(options.dotted) || 0));
        if (dots > 0) {
            parts.push(dotMarkup(dots));
        }
        return wrap(parts.join(''));
    }

    function restBody(duration) {
        if (duration === 1) {
            // Целая пауза висит под средней линией
            return '<rect class="glyph-rest" x="-6" y="3" width="12" height="5" rx="1" fill="#111111"/>';
        }
        if (duration === 2) {
            // Половинная пауза лежит на средней линии
            return '<rect class="glyph-rest" x="-6" y="-8" width="12" height="5" rx="1" fill="#111111"/>';
        }
        if (duration === 4) {
            return '<path class="glyph-rest" d="M 3 -16 L -2 -7 L 3 -2 L -2 5 L 3 10 L -2 16" ' +
                'fill="none" stroke="#111111" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/>';
        }
        var marks = '<line class="glyph-rest" x1="4" y1="-14" x2="-3" y2="10" ' +
            'stroke="#111111" stroke-width="2.4" stroke-linecap="round"/>' +
            '<circle class="glyph-rest" cx="-1" cy="-10" r="3.1" fill="#111111"/>';
        if (duration === 16) {
            marks += '<circle class="glyph-rest" cx="-3" cy="-3" r="3.1" fill="#111111"/>';
        }
        return marks;
    }

    // Глиф паузы. options: { duration, dotted }
    function restSvg(options) {
        options = options || {};
        var duration = durationInfo(options.duration).value;
        var parts = [haloMarkup(), hitMarkup(), restBody(duration)];
        var dots = options.dotted === true ? 1 : Math.min(3, Math.max(0, Number(options.dotted) || 0));
        if (dots > 0) {
            parts.push(dotMarkup(dots));
        }
        return wrap(parts.join(''));
    }

    // Сколько долей (четвертей) занимает длительность.
    function beatsFor(duration, dotted) {
        var beats = 4 / durationInfo(duration).value;
        return dotted ? beats * 1.5 : beats;
    }

    return {
        DURATIONS: DURATIONS,
        FRAME: FRAME,
        durationInfo: durationInfo,
        isHollow: isHollow,
        flagCount: flagCount,
        beatsFor: beatsFor,
        noteSvg: noteSvg,
        restSvg: restSvg
    };
}));