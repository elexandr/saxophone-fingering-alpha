// Saxophone Fingering Assistant - кэш картинок аппликатур
//
// Браузер, открытый как file://, по умолчанию запрещает странице читать соседние файлы,
// поэтому байты картинок удаётся получить не всегда. Модуль это проверяет сам:
//   * если чтение разрешено - картинки один раз складываются в хранилище браузера (IndexedDB)
//     и дальше берутся оттуда через blob-ссылки;
//   * если запрещено - приложение просто грузит файлы напрямую, как раньше.
// Состояние хранилища доступно через status() и показывается в интерфейсе.

(function (root) {
    'use strict';

    var DB_NAME = 'saxophone-fingering-assistant-alpha'; // у альфы своё хранилище
    var STORE_NAME = 'fingering-images';
    var DB_VERSION = 2; // поднята: имена картинок те же, а содержимое другое
    // Версия в адресе обходит и кэш браузера: старые картинки больше не подсунуть
    var IMAGE_VERSION = '?v=2';

    function FingeringImageCache(basePath) {
        this.basePath = basePath || 'fingerings_images/';
        this.db = null;
        this.urls = Object.create(null);
        this.readable = false;
        this.reason = '';
        this.synced = 0;
        this.total = 0;
    }

    FingeringImageCache.prototype.supported = function () {
        return typeof window !== 'undefined' && !!window.indexedDB && !!window.URL && !!URL.createObjectURL;
    };

    FingeringImageCache.prototype.openDatabase = function () {
        var self = this;
        if (!this.supported()) {
            this.reason = 'Хранилище браузера недоступно';
            return Promise.resolve(null);
        }
        return new Promise(function (resolve) {
            var request;
            try {
                request = window.indexedDB.open(DB_NAME, DB_VERSION);
            } catch (e) {
                self.reason = e && e.message ? e.message : String(e);
                resolve(null);
                return;
            }
            request.onupgradeneeded = function () {
                var db = request.result;
                // Хранилище кэширует картинки по имени, а имена не менялись:
                // при обновлении версии старое содержимое надо выбросить
                if (db.objectStoreNames.contains(STORE_NAME)) {
                    db.deleteObjectStore(STORE_NAME);
                }
                db.createObjectStore(STORE_NAME);
            };
            request.onsuccess = function () { resolve(request.result); };
            request.onerror = function () {
                self.reason = request.error && request.error.message ? request.error.message : 'Ошибка хранилища';
                resolve(null);
            };
            request.onblocked = function () {
                self.reason = 'Хранилище занято другой вкладкой';
                resolve(null);
            };
        });
    };

    FingeringImageCache.prototype.transaction = function (mode) {
        return this.db.transaction(STORE_NAME, mode).objectStore(STORE_NAME);
    };

    FingeringImageCache.prototype.storedNames = function () {
        var self = this;
        if (!this.db) return Promise.resolve([]);
        return new Promise(function (resolve) {
            var names = [];
            var request = self.transaction('readonly').openKeyCursor();
            request.onsuccess = function () {
                var cursor = request.result;
                if (cursor) {
                    names.push(cursor.key);
                    cursor.continue();
                } else {
                    resolve(names);
                }
            };
            request.onerror = function () { resolve([]); };
        });
    };

    FingeringImageCache.prototype.put = function (name, blob) {
        var self = this;
        if (!this.db) return Promise.resolve(false);
        return new Promise(function (resolve) {
            var request = self.transaction('readwrite').put(blob, name);
            request.onsuccess = function () { resolve(true); };
            request.onerror = function () { resolve(false); };
        });
    };

    FingeringImageCache.prototype.readAll = function () {
        var self = this;
        if (!this.db) return Promise.resolve([]);
        return new Promise(function (resolve) {
            var pairs = [];
            var request = self.transaction('readonly').openCursor();
            request.onsuccess = function () {
                var cursor = request.result;
                if (cursor) {
                    pairs.push({ name: cursor.key, blob: cursor.value });
                    cursor.continue();
                } else {
                    resolve(pairs);
                }
            };
            request.onerror = function () { resolve([]); };
        });
    };

    // Чтение одного файла рядом со страницей. Именно здесь file:// обычно отвечает отказом.
    // Имя обязательно экранируем: в именах аппликатур встречается #, а он в URL начинает якорь.
    FingeringImageCache.prototype.readFile = function (name) {
        var url = this.basePath + encodeURIComponent(name) + IMAGE_VERSION;

        if (typeof fetch === 'function') {
            return fetch(url).then(function (response) {
                if (!response.ok) throw new Error('HTTP ' + response.status);
                return response.blob();
            });
        }

        return new Promise(function (resolve, reject) {
            var xhr = new XMLHttpRequest();
            xhr.open('GET', url, true);
            xhr.responseType = 'blob';
            xhr.onload = function () {
                if (xhr.status === 0 || (xhr.status >= 200 && xhr.status < 300)) resolve(xhr.response);
                else reject(new Error('HTTP ' + xhr.status));
            };
            xhr.onerror = function () { reject(new Error('Файл недоступен для чтения')); };
            xhr.send();
        });
    };

    FingeringImageCache.prototype.init = function () {
        var self = this;
        return this.openDatabase().then(function (db) {
            self.db = db;
            return self.status();
        });
    };

    // Простой пул: читаем пачками, чтобы не открывать 44 запроса разом и не ждать по одному
    function runPool(items, worker, limit) {
        return new Promise(function (resolve) {
            var index = 0;
            var running = 0;
            var done = false;

            function finishIfDone() {
                if (!done && index >= items.length && running === 0) {
                    done = true;
                    resolve();
                }
            }

            function launch() {
                while (running < limit && index < items.length) {
                    (function (item) {
                        running++;
                        Promise.resolve()
                            .then(function () { return worker(item); })
                            .catch(function () { /* отдельный файл пропускаем */ })
                            .then(function () {
                                running--;
                                launch();
                                finishIfDone();
                            });
                    }(items[index++]));
                }
                finishIfDone();
            }

            launch();
        });
    }

    // Догружает отсутствующие картинки в хранилище. Возвращает статус.
    FingeringImageCache.prototype.sync = function (names, onProgress) {
        var self = this;
        var list = names || [];
        this.total = list.length;

        if (!this.db) {
            this.readable = false;
            return Promise.resolve(this.status());
        }

        return this.storedNames().then(function (stored) {
            var missing = list.filter(function (name) { return stored.indexOf(name) === -1; });
            self.synced = list.length - missing.length;

            if (!missing.length) {
                return self.prime().then(function () {
                    self.readable = true;
                    return self.status();
                });
            }

            // Пробное чтение: если браузер запрещает доступ, дальше не идём.
            return self.readFile(missing[0]).then(function (blob) {
                self.readable = true;
                return self.put(missing[0], blob).then(function () {
                    self.synced++;
                    if (onProgress) onProgress(self.synced, self.total);

                    return runPool(missing.slice(1), function (name) {
                        return self.readFile(name).then(function (b) {
                            return self.put(name, b);
                        }).then(function () {
                            self.synced++;
                            if (onProgress) onProgress(self.synced, self.total);
                        });
                    }, 8);
                }).then(function () { return self.prime(); }).then(function () {
                    return self.status();
                });
            }).catch(function (error) {
                self.readable = false;
                self.reason = error && error.message ? error.message : String(error);
                return self.prime().then(function () { return self.status(); });
            });
        });
    };

    // Готовит blob-ссылки для всего, что уже лежит в хранилище.
    FingeringImageCache.prototype.prime = function () {
        var self = this;
        return this.readAll().then(function (pairs) {
            pairs.forEach(function (pair) {
                if (!self.urls[pair.name]) {
                    try {
                        self.urls[pair.name] = URL.createObjectURL(pair.blob);
                    } catch (e) { /* ссылку создать не удалось - останется прямой путь */ }
                }
            });
            return pairs.length;
        });
    };

    FingeringImageCache.prototype.has = function (name) {
        return !!this.urls[name];
    };

    FingeringImageCache.prototype.url = function (name) {
        if (this.urls[name]) return this.urls[name];
        return this.basePath + encodeURIComponent(name);
    };

    FingeringImageCache.prototype.status = function () {
        return {
            supported: this.supported(),
            readable: this.readable,
            stored: Object.keys(this.urls).length,
            total: this.total,
            reason: this.reason
        };
    };

    root.FingeringImageCache = FingeringImageCache;
}(typeof window !== 'undefined' ? window : this));
