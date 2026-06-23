// timer-worker.js
let interval = null;

self.onmessage = function(e) {
    if (e.data === 'start') {
        if (interval) clearInterval(interval);
        interval = setInterval(() => {
            self.postMessage('tick');
        }, 1000);
    } else if (e.data === 'stop') {
        if (interval) clearInterval(interval);
    }
};