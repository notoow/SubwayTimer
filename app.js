// ?곹깭 愿由?let currentStation = null;
let currentDirection = 'up';
let favorites = [];
let apiKey = '585858626a74616e38375961745252'; // Seoul Open Data API Key (?ㅼ떆媛?吏?섏쿋 ?꾩슜)
let refreshInterval = null;
let countdownInterval = null;
let arrivalData = [];
let trainPositions = []; // ?ㅼ떆媛??댁감 ?꾩튂 ?곗씠??let lastFetchTime = null;
let notifyEnabled = false;
let notifyThreshold = 60; // 1遺????뚮┝
let walkingTimes = {}; // ??퀎 ?꾨낫 ?쒓컙 ???let currentWalkingTime = 0; // ?꾩옱 ?좏깮????쓽 ?꾨낫 ?쒓컙 (遺?
let leaveNotified = false; // 異쒕컻 ?뚮┝ 諛쒖넚 ?щ?
let targetDestination = null; // ?뚮┝ ????됱꽑吏 (null?대㈃ 媛??鍮⑤━ ?ㅻ뒗 ?댁감)

// Cloudflare Worker URL (API ?꾨줉??
const WORKER_URL = 'https://subway-timer.antcow0706.workers.dev';
let workerUrl = localStorage.getItem('subwayTimer_workerUrl') || WORKER_URL;

// DOM ?붿냼
const stationInput = document.getElementById('stationInput');
const searchBtn = document.getElementById('searchBtn');
const suggestions = document.getElementById('suggestions');
const stationInfo = document.getElementById('stationInfo');
const stationName = document.getElementById('stationName');
const lineIndicator = document.getElementById('lineIndicator');
const arrivalList = document.getElementById('arrivalList');
const favoriteBtn = document.getElementById('favoriteBtn');
const favoritesList = document.getElementById('favoritesList');
const directionTabs = document.querySelectorAll('.direction-tab');
const themeToggle = document.getElementById('themeToggle');
const refreshBtn = document.getElementById('refreshBtn');
const shareBtn = document.getElementById('shareBtn');
const notifyBtn = document.getElementById('notifyBtn');
const congestionFill = document.getElementById('congestionFill');
const congestionText = document.getElementById('congestionText');
const lastUpdate = document.getElementById('lastUpdate');
const toast = document.getElementById('toast');
const displayModeBtn = document.getElementById('displayModeBtn');
const displayMode = document.getElementById('displayMode');
const exitDisplayMode = document.getElementById('exitDisplayMode');
const displayLine = document.getElementById('displayLine');
const displayStationName = document.getElementById('displayStationName');
const displayDirection = document.getElementById('displayDirection');
const displayMinutes = document.getElementById('displayMinutes');
const displaySeconds = document.getElementById('displaySeconds');
const displayColon = document.getElementById('displayColon');
const displayArriving = document.getElementById('displayArriving');
const segmentDisplay = document.querySelector('.segment-display');
const displayDestination = document.getElementById('displayDestination');
const displayCongestion = document.getElementById('displayCongestion');
const nextTrain1 = document.getElementById('nextTrain1');
const nextTrain2 = document.getElementById('nextTrain2');
const walkingMinus = document.getElementById('walkingMinus');
const walkingPlus = document.getElementById('walkingPlus');
const walkingTimeValue = document.getElementById('walkingTimeValue');
const leaveAlert = document.getElementById('leaveAlert');
const leaveAlertText = document.getElementById('leaveAlertText');
const displayLeaveAlert = document.getElementById('displayLeaveAlert');
const displayLeaveText = document.getElementById('displayLeaveText');

let isDisplayMode = false;
let displayInterval = null;

// 초기화
function init() {
    loadTheme();
    loadApiKey();
    loadFavorites();
    loadNotifySettings();
    loadWalkingTimes();
    setupEventListeners();
    renderFavorites();
    checkUrlParams();
}

// URL ?뚮씪誘명꽣 ?뺤씤
function checkUrlParams() {
    const params = new URLSearchParams(window.location.search);
    const stationParam = params.get('station');
    const lineParam = params.get('line');
    const dirParam = params.get('dir');

    if (stationParam) {
        const station = {
            name: stationParam,
            line: lineParam || '2'
        };

        if (dirParam === 'down') {
            currentDirection = 'down';
            directionTabs.forEach(tab => {
                tab.classList.toggle('active', tab.dataset.direction === 'down');
            });
        }

        selectStation(station);
    }
}

// ?대깽??由ъ뒪???ㅼ젙
function setupEventListeners() {
    // 寃???낅젰
    stationInput.addEventListener('input', handleSearchInput);
    stationInput.addEventListener('focus', handleSearchInput);
    stationInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            const results = searchStations(stationInput.value);
            if (results.length > 0) {
                selectStation(results[0]);
            }
        }
    });

    // 寃??踰꾪듉
    searchBtn.addEventListener('click', () => {
        const results = searchStations(stationInput.value);
        if (results.length > 0) {
            selectStation(results[0]);
        }
    });

    // 寃?됱갹 ?몃? ?대┃???쒖븞 ?リ린
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.search-section')) {
            suggestions.classList.remove('active');
        }
    });

    // 諛⑺뼢 ??    directionTabs.forEach(tab => {
    tab.addEventListener('click', () => {
        currentDirection = tab.dataset.direction;
        directionTabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');

        // 諛⑺뼢 蹂寃????됱꽑吏 ?좏깮 珥덇린??            targetDestination = null;
        lastRenderedData = null;

        if (currentStation) {
            fetchArrivalInfo(currentStation);
            updateCongestion();
            updateUrl();
        }
    });
});

// 利먭꺼李얘린 踰꾪듉
favoriteBtn.addEventListener('click', toggleFavorite);

// ?뚮쭏 ?좉?
themeToggle.addEventListener('click', toggleTheme);

// ?덈줈怨좎묠
refreshBtn.addEventListener('click', handleRefresh);

// 怨듭쑀
shareBtn.addEventListener('click', handleShare);

// ?뚮┝
notifyBtn.addEventListener('click', toggleNotify);

// ?꾧킅??紐⑤뱶
displayModeBtn.addEventListener('click', enterDisplayMode);
exitDisplayMode.addEventListener('click', exitDisplayModeHandler);

// ESC ?ㅻ줈 ?꾧킅??紐⑤뱶 醫낅즺
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && isDisplayMode) {
        exitDisplayModeHandler();
    }
});

// ?꾧킅??紐⑤뱶?먯꽌 ?대┃?섎㈃ ?꾩껜?붾㈃ ?좉?
displayMode.addEventListener('dblclick', toggleFullscreen);

// ?꾨낫 ?쒓컙 議곗젅
walkingMinus.addEventListener('click', () => adjustWalkingTime(-1));
walkingPlus.addEventListener('click', () => adjustWalkingTime(1));
}

// ?뚮쭏 愿??function loadTheme() {
const theme = localStorage.getItem('subwayTimer_theme') || 'dark';
document.documentElement.setAttribute('data-theme', theme);
}

function toggleTheme() {
    const current = document.documentElement.getAttribute('data-theme');
    const next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('subwayTimer_theme', next);
}

// ?덈줈怨좎묠
function handleRefresh() {
    if (!currentStation) return;

    refreshBtn.classList.add('spinning');
    fetchArrivalInfo(currentStation).finally(() => {
        setTimeout(() => refreshBtn.classList.remove('spinning'), 500);
    });
}

// 怨듭쑀
async function handleShare() {
    if (!currentStation) return;

    const url = new URL(window.location.href);
    url.searchParams.set('station', currentStation.name);
    url.searchParams.set('line', currentStation.line);
    url.searchParams.set('dir', currentDirection);

    const shareUrl = url.toString();

    if (navigator.share) {
        try {
            await navigator.share({
                title: `${currentStation.name} 지하철 도착 정보`,
                url: shareUrl
            });
        } catch (e) {
            // ?ъ슜?먭? 痍⑥냼??寃쎌슦
        }
    } else {
        // ?대┰蹂대뱶??蹂듭궗
        await navigator.clipboard.writeText(shareUrl);
        showToast('링크가 복사되었습니다.');
    }
}

// URL ?낅뜲?댄듃
function updateUrl() {
    if (!currentStation) return;

    const url = new URL(window.location.href);
    url.searchParams.set('station', currentStation.name);
    url.searchParams.set('line', currentStation.line);
    url.searchParams.set('dir', currentDirection);

    window.history.replaceState({}, '', url.toString());
}

// ?뚮┝ ?좉?
async function toggleNotify() {
    if (!notifyEnabled) {
        // ?뚮┝ 沅뚰븳 ?붿껌
        if ('Notification' in window) {
            const permission = await Notification.requestPermission();
            if (permission === 'granted') {
                notifyEnabled = true;
                notifyBtn.classList.add('active');
                localStorage.setItem('subwayTimer_notify', 'true');
                showToast('도착 1분 전에 알림을 보내드립니다.');
            } else {
                showToast('알림 권한이 필요합니다.');
            }
        }
    } else {
        notifyEnabled = false;
        notifyBtn.classList.remove('active');
        localStorage.setItem('subwayTimer_notify', 'false');
        showToast('알림이 해제되었습니다.');
    }
}

function loadNotifySettings() {
    notifyEnabled = localStorage.getItem('subwayTimer_notify') === 'true';
    if (notifyEnabled && 'Notification' in window && Notification.permission === 'granted') {
        notifyBtn.classList.add('active');
    } else {
        notifyEnabled = false;
    }
}

function sendNotification(message) {
    if (notifyEnabled && 'Notification' in window && Notification.permission === 'granted') {
        new Notification('지하철 도착 알림', {
            body: message,
            icon: 'icons/icon.svg',
            tag: 'subway-arrival'
        });
    }
}

// ?좎뒪??硫붿떆吏
function showToast(message) {
    toast.textContent = message;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 2500);
}

// ?쇱옟??怨꾩궛 (?쒓컙? 湲곕컲 ?듦퀎)
function updateCongestion() {
    const hour = new Date().getHours();
    const day = new Date().getDay();
    const isWeekend = day === 0 || day === 6;

    let level, text;

    if (isWeekend) {
        // 二쇰쭚
        if (hour >= 12 && hour <= 18) {
            level = 'medium';
            text = '蹂댄넻';
        } else {
            level = 'low';
            text = '?ъ쑀';
        }
    } else {
        // ?됱씪
        if ((hour >= 7 && hour <= 9) || (hour >= 18 && hour <= 20)) {
            level = 'very-high';
            text = '留ㅼ슦?쇱옟';
        } else if ((hour >= 6 && hour < 7) || (hour > 9 && hour <= 10) ||
            (hour >= 17 && hour < 18) || (hour > 20 && hour <= 21)) {
            level = 'high';
            text = '?쇱옟';
        } else if (hour >= 10 && hour <= 17) {
            level = 'medium';
            text = '蹂댄넻';
        } else {
            level = 'low';
            text = '?ъ쑀';
        }
    }

    congestionFill.className = 'congestion-fill ' + level;
    congestionText.className = 'congestion-text ' + level;
    congestionText.textContent = text;
}

// 留덉?留??낅뜲?댄듃 ?쒓컙 ?쒖떆
function updateLastUpdateTime() {
    const now = new Date();
    const timeStr = now.toLocaleTimeString('ko-KR', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    });
    lastUpdate.textContent = `留덉?留??낅뜲?댄듃: ${timeStr}`;
}

// 寃???낅젰 泥섎━
function handleSearchInput() {
    const query = stationInput.value.trim();
    const results = searchStations(query);

    if (results.length > 0 && query.length > 0) {
        renderSuggestions(results);
        suggestions.classList.add('active');
    } else {
        suggestions.classList.remove('active');
    }
}

// 寃???쒖븞 ?뚮뜑留?function renderSuggestions(results) {
suggestions.innerHTML = results.map(station => `
        <div class="suggestion-item" data-station="${station.name}" data-line="${station.line}">
            <span class="suggestion-line" style="background-color: ${getLineColor(station.line)}">
                ${getLineName(station.line)}
            </span>
            <span class="suggestion-name">${station.name}??/span>
        </div>
    `).join('');

suggestions.querySelectorAll('.suggestion-item').forEach(item => {
    item.addEventListener('click', () => {
        selectStation({
            name: item.dataset.station,
            line: item.dataset.line
        });
    });
});
}

// ???좏깮
function selectStation(station) {
    currentStation = station;
    stationInput.value = station.name;
    suggestions.classList.remove('active');

    // ?됱꽑吏 ?좏깮 珥덇린??    targetDestination = null;
    lastRenderedData = null;

    // UI ?낅뜲?댄듃
    stationName.textContent = station.name + '??;
    lineIndicator.textContent = getLineName(station.line);
    lineIndicator.style.backgroundColor = getLineColor(station.line);
    stationInfo.classList.remove('hidden');

    // 利먭꺼李얘린 ?곹깭 ?낅뜲?댄듃
    updateFavoriteButton();

    // ?쇱옟???낅뜲?댄듃
    updateCongestion();

    // ?꾨낫 ?쒓컙 濡쒕뱶
    loadStationWalkingTime();

    // URL ?낅뜲?댄듃
    updateUrl();

    // ?꾩갑 ?뺣낫 媛?몄삤湲?    fetchArrivalInfo(station);

    // ?먮룞 ?덈줈怨좎묠 ?ㅼ젙
    if (refreshInterval) clearInterval(refreshInterval);
    refreshInterval = setInterval(() => {
        fetchArrivalInfo(station);
    }, 30000);
}

// API ?몄텧 ?ы띁 ?⑥닔
async function fetchFromProxy(url) {
    const response = await fetch(url, {
        headers: { 'Accept': 'application/json' }
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const text = await response.text();
    if (!text || text.trim() === '') throw new Error('鍮??묐떟');
    return JSON.parse(text);
}

// ?꾩갑 ?뺣낫 媛?몄삤湲?(?꾩갑?뺣낫 + ?댁감?꾩튂 API 蹂묐젹 ?몄텧)
async function fetchArrivalInfo(station) {
    if (!apiKey) {
        showDemoMode(station);
        return;
    }

    if (arrivalData.length === 0) {
        showLoading();
    }

    try {
        const stationName = encodeURIComponent(station.name);
        const lineName = encodeURIComponent(getApiLineName(station.line));

        // 蹂묐젹濡???API ?몄텧
        const [arrivalResult, positionResult] = await Promise.allSettled([
            // 1. ?ㅼ떆媛??꾩갑?뺣낫
            fetchFromProxy(`${workerUrl}?station=${stationName}`),
            // 2. ?ㅼ떆媛??댁감 ?꾩튂
            fetchFromProxy(`${workerUrl}?type=position&line=${lineName}`)
        ]);

        // ?꾩갑?뺣낫 泥섎━
        let arrivals = [];
        console.log('?꾩갑?뺣낫 API 寃곌낵:', arrivalResult);
        if (arrivalResult.status === 'fulfilled') {
            const data = arrivalResult.value;
            console.log('?꾩갑?뺣낫 ?곗씠??', data);
            if (data.realtimeArrivalList && Array.isArray(data.realtimeArrivalList)) {
                arrivals = data.realtimeArrivalList;
                console.log('?꾩갑 ?댁감 ??', arrivals.length);
            } else {
                console.log('realtimeArrivalList ?놁쓬. ??', Object.keys(data));
            }
        } else {
            console.error('?꾩갑?뺣낫 API ?ㅽ뙣:', arrivalResult.reason);
        }

        // ?댁감 ?꾩튂 泥섎━
        if (positionResult.status === 'fulfilled') {
            const posData = positionResult.value;
            if (posData.realtimePositionList && Array.isArray(posData.realtimePositionList)) {
                trainPositions = posData.realtimePositionList;
                console.log('?댁감 ?꾩튂:', trainPositions.length + '? ?댄뻾 以?);
            }
        }

        if (arrivals.length === 0) {
            showNoData();
            return;
        }

        lastFetchTime = Date.now();
        updateLastUpdateTime();
        renderArrivals(arrivals);
        startCountdown();

    } catch (error) {
        console.error('API ?몄텧 ?ㅽ뙣:', error);
        showDemoMode(station);
    }
}

const lineDestinations = {
    '1': { up: ['소요산행', '광운대행'], down: ['인천행', '서동탄행'] },
    '2': { up: ['내선순환'], down: ['외선순환'] },
    '3': { up: ['대화행', '구파발행'], down: ['오금행', '수서행'] },
    '4': { up: ['진접행', '당고개행'], down: ['사당행', '오이도행'] },
    '5': { up: ['방화행'], down: ['마천행', '하남검단산행'] },
    '6': { up: ['응암순환'], down: ['신내행'] },
    '7': { up: ['장암행'], down: ['석남행', '온수행'] },
    '8': { up: ['별내행', '암사행'], down: ['모란행'] },
    '9': { up: ['개화행'], down: ['중앙보훈병원행'] },
    '경의중앙': { up: ['문산행'], down: ['용문행', '덕소행'] },
    '공항철도': { up: ['서울역행'], down: ['인천공항2터미널행'] },
    '신분당': { up: ['신사행'], down: ['광교행'] },
    '수인분당': { up: ['왕십리행'], down: ['인천행'] },
    '경춘': { up: ['청량리행'], down: ['춘천행'] },
    '우이신설': { up: ['북한산우이행'], down: ['신설동행'] },
    '서해': { up: ['일산행'], down: ['원시행'] },
    '김포골드': { up: ['양촌행'], down: ['김포공항행'] },
    '에버라인': { up: ['기흥행'], down: ['전대·에버랜드행'] },
    '의정부': { up: ['발곡행'], down: ['탑석행'] },
    'GTX-A': { up: ['수서행'], down: ['동탄행'] }
};

// ?곕え 紐⑤뱶 ?쒖떆
function showDemoMode(station) {
    lastFetchTime = Date.now();
    updateLastUpdateTime();

    const line = station.line || '2';
    const lineData = lineDestinations[line] || lineDestinations['2'];
    const destinations = currentDirection === 'up' ? lineData.up : lineData.down;

    // ?됱꽑吏媛 遺議깊븯硫??쒗솚?댁꽌 ?ъ슜
    const getDest = (i) => destinations[i % destinations.length];

    arrivalData = [
        { seconds: 45, destination: getDest(0), status: '?꾩뿭 異쒕컻' },
        { seconds: 180, destination: getDest(1), status: '2분 전' },
        { seconds: 420, destination: getDest(2), status: '4분 전' },
    ];

    renderArrivalItems();
    startCountdown();
}

// 移댁슫?몃떎???쒖옉
function startCountdown() {
    if (countdownInterval) {
        clearInterval(countdownInterval);
    }

    let notified = new Set();

    countdownInterval = setInterval(() => {
        const elapsed = Math.floor((Date.now() - lastFetchTime) / 1000);

        // arrivalData媛 洹몃９ 援ъ“?몄? ?뺤씤
        const isGrouped = arrivalData.length > 0 && arrivalData[0].trains;

        if (isGrouped) {
            // 洹몃９ 援ъ“: 媛?洹몃９???댁감???쒓컙 ?낅뜲?댄듃
            arrivalData = arrivalData.map(group => ({
                ...group,
                trains: group.trains.map(train => ({
                    ...train,
                    currentSeconds: train.seconds - elapsed
                })).filter(train => train.currentSeconds > -30)
            })).filter(group => group.trains.length > 0);

            // ?뚮┝ 泥댄겕 (?좏깮???됱꽑吏 ?먮뒗 媛??鍮좊Ⅸ ?댁감)
            const target = getTargetTrain();
            if (target) {
                const sec = target.train.currentSeconds ?? target.train.seconds;
                if (sec <= notifyThreshold && sec > 0 && !notified.has(target.destination)) {
                    notified.add(target.destination);
                    sendNotification(`${target.destination} 열차가 약 1분 후 도착합니다.`);
                }
            }
        } else {
            // 湲곗〈 flat 援ъ“
            arrivalData = arrivalData.map(item => ({
                ...item,
                currentSeconds: item.seconds - elapsed
            })).filter(item => item.currentSeconds > -30);

            if (arrivalData.length > 0) {
                const first = arrivalData[0];
                const sec = first.currentSeconds ?? first.seconds;
                if (sec <= notifyThreshold && sec > 0 && !notified.has('first')) {
                    notified.add('first');
                    sendNotification(`${target.destination} 열차가 약 1분 후 도착합니다.`);
                }
            }
        }

        if (arrivalData.length === 0) {
            if (currentStation) {
                fetchArrivalInfo(currentStation);
            }
            return;
        }

        renderArrivalItems();

        // 異쒕컻 ?뚮┝ ?낅뜲?댄듃
        updateLeaveAlert();
    }, 1000);
}

// ?뚮뜑留??곹깭 異붿쟻 (源쒕묀嫄곕┝ 諛⑹?)
let lastRenderedData = null;

// ?꾩갑 ?뺣낫 ??ぉ ?뚮뜑留?(?됱꽑吏蹂?洹몃９)
function renderArrivalItems() {
    const lineColor = currentStation ? getLineColor(currentStation.line) : '#00A84D';

    // arrivalData媛 洹몃９ 援ъ“?몄? ?뺤씤
    const isGrouped = arrivalData.length > 0 && arrivalData[0].trains;

    if (!isGrouped) {
        // 湲곗〈 flat 援ъ“ (?곕え 紐⑤뱶 ??
        renderFlatItems(lineColor);
        return;
    }

    const currentDataKey = arrivalData.map(g =>
        `${g.destination}:${g.trains.map(t => t.seconds).join(',')}`
    ).join('|');
    const needsFullRender = lastRenderedData !== currentDataKey;

    if (needsFullRender) {
        lastRenderedData = currentDataKey;

        arrivalList.innerHTML = arrivalData.map((group, gIdx) => {
            const isSelected = targetDestination === group.destination;
            const trainsHtml = group.trains.map((train, tIdx) => {
                const seconds = train.currentSeconds ?? train.seconds;
                const timeInfo = formatTime(seconds);

                let badges = '';
                if (train.trainType === '湲됲뻾' || train.trainType === 'ITX') {
                    badges += `<span class="train-badge express">${train.trainType}</span>`;
                }
                if (train.isLast) {
                    badges += `<span class="train-badge last">留됱감</span>`;
                }

                let orderLabel = (tIdx + 1).toString();
                if (tIdx === 0) orderLabel = '?대쾲';
                else if (tIdx === 1) orderLabel = '?ㅼ쓬';
                else if (tIdx === 2) orderLabel = '?ㅻ떎??;

                return `
                    <div class="train-row ${timeInfo.className}" data-group="${gIdx}" data-train="${tIdx}">
                        <span class="train-order badge">${orderLabel}</span>
                        <span class="train-status">${train.status}${badges}</span>
                        <span class="train-time" data-time-slot="${gIdx}-${tIdx}">${timeInfo.html}</span>
                    </div>
                `;
            }).join('');

            return `
                <div class="destination-group ${isSelected ? 'selected' : ''}" data-destination="${group.destination}" style="--line-color: ${lineColor}">
                    <div class="destination-header">
                        <span class="destination-indicator" style="background-color: ${lineColor}"></span>
                        <span class="destination-name">${group.destination}</span>
                        ${isSelected ? '<span class="destination-alert-icon">?뵒</span>' : '<span class="destination-select-hint">??븯???뚮┝ ?ㅼ젙</span>'}
                    </div>
                    <div class="trains-list">
                        ${trainsHtml}
                    </div>
                </div>
            `;
        }).join('');

        // ?됱꽑吏 ?대┃ ?대깽??異붽?
        arrivalList.querySelectorAll('.destination-group').forEach(group => {
            group.addEventListener('click', () => {
                const dest = group.dataset.destination;
                selectTargetDestination(dest);
            });
        });
    } else {
        // ?쒓컙留??낅뜲?댄듃
        arrivalData.forEach((group, gIdx) => {
            group.trains.forEach((train, tIdx) => {
                const seconds = train.currentSeconds ?? train.seconds;
                const timeInfo = formatTime(seconds);
                const timeSlot = arrivalList.querySelector(`[data - time - slot="${gIdx}-${tIdx}"]`);
                const trainRow = arrivalList.querySelector(`[data - group= "${gIdx}"][data - train="${tIdx}"]`);

                if (timeSlot) {
                    timeSlot.innerHTML = timeInfo.html;
                }
                if (trainRow) {
                    trainRow.className = `train - row ${timeInfo.className} `;
                }
            });
        });
    }
}

// 湲곗〈 flat 援ъ“ ?뚮뜑留?(?곕え 紐⑤뱶??
function renderFlatItems(lineColor) {
    const items = arrivalData.slice(0, 4);
    arrivalList.innerHTML = items.map((item, index) => {
        const seconds = item.currentSeconds ?? item.seconds;
        const timeInfo = formatTime(seconds);

        let badges = '';
        if (item.trainType === '湲됲뻾' || item.trainType === 'ITX') {
            badges += `< span class="train-badge express" > ${item.trainType}</span > `;
        }
        if (item.isLast) {
            badges += `< span class="train-badge last" > 留됱감</span > `;
        }

        return `
                < div class="arrival-item ${timeInfo.className}" data - index="${index}" style = "--line-color: ${lineColor}" >
                <span class="arrival-order" style="background-color: ${lineColor}">${index + 1}</span>
                <div class="arrival-info">
                    <div class="arrival-destination">${item.destination}${badges}</div>
                    <div class="arrival-status">${item.status}</div>
                </div>
                <div class="arrival-time" data-time-slot="${index}">
                    ${timeInfo.html}
                </div>
            </div >
                `;
    }).join('');
}

// ?쒓컙 ?щ㎎
function formatTime(seconds) {
    if (seconds <= 0) {
        if (seconds > -10) {
            return {
                html: '<span class="time-value">?꾩갑</span>',
                className: 'arriving'
            };
        } else {
            return {
                html: '<span class="time-value">異쒕컻</span>',
                className: 'departing' // CSS class needs to be added/checked
            };
        }
    }

    if (seconds < 60) {
        return {
            html: `< span class="time-value" > ${seconds}</span > <span class="time-unit">珥?/span>`,
            className: 'imminent'
        };
    }

    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;

    if (minutes < 3) {
        return {
            html: `< span class="time-value" > ${minutes}:${secs.toString().padStart(2, '0')}</span > `,
            className: 'imminent'
        };
    }

    return {
        html: `< span class="time-value" > ${minutes}</span > <span class="time-unit">遺?/span>`,
        className: ''
    };
}

// ?몄꽑 肄붾뱶 ??subwayId 留ㅽ븨
const lineToSubwayId = {
    '1': '1001', '2': '1002', '3': '1003', '4': '1004', '5': '1005',
    '6': '1006', '7': '1007', '8': '1008', '9': '1009',
    '寃쎌쓽以묒븰': '1063',
    '怨듯빆泥좊룄': '1065',
    '寃쎌텣': '1067',
    '?섏씤遺꾨떦': '1075',
    '?좊텇??: '1077',
    '?곗씠?좎꽕': '1092',
    'GTX-A': '1032',
};

// ?꾩갑 ?뺣낫 ?뚮뜑留?(API ?묐떟 泥섎━)
function renderArrivals(arrivals) {
    // ?붾쾭源? 紐⑤뱺 ?댁감??諛⑺뼢 ?뺣낫 ?뺤씤
    console.log('=== ?꾩갑 ?뺣낫 ===');
    arrivals.forEach(a => {
        console.log(`${a.bstatnNm || a.trainLineNm} | 諛⑺뼢: ${a.updnLine} | ?몄꽑: ${a.subwayId} | ?꾩갑: ${a.barvlDt} 珥?);
    });

    // ?좏깮???몄꽑??subwayId
    const targetSubwayId = currentStation ? lineToSubwayId[currentStation.line] : null;

    const filtered = arrivals.filter(arrival => {
        // ?몄꽑 ?꾪꽣留?(?좏깮???몄꽑留?
        if (targetSubwayId && arrival.subwayId !== targetSubwayId) {
            return false;
        }

        // 0珥덉씠怨?"?꾩갑", "吏꾩엯", "異쒕컻" ?곹깭硫??쒖쇅 (?대? 吏?섍컙 ?댁감)
        const barvlDt = parseInt(arrival.barvlDt) || 0;
        const arvlMsg = (arrival.arvlMsg2 || '').toLowerCase();
        if (barvlDt === 0 && (arvlMsg.includes('?꾩갑') || arvlMsg.includes('吏꾩엯') || arvlMsg.includes('異쒕컻'))) {
            return false;
        }

        const updnLine = arrival.updnLine || '';
        // ?곹뻾: ?곹뻾, ?댁꽑 / ?섑뻾: ?섑뻾, ?몄꽑
        const isUp = updnLine.includes('?곹뻾') || updnLine.includes('?댁꽑');
        const isDown = updnLine.includes('?섑뻾') || updnLine.includes('?몄꽑');

        if (currentDirection === 'up') {
            return isUp;
        } else {
            return isDown;
        }
    });

    console.log(`? 꾪꽣留 ? 寃곌낵 : ${ filtered.length } 媛 ? ${ currentDirection })`);

    if (filtered.length === 0) {
        showNoData();
        return;
    }

    const now = Date.now();

    const allTrains = filtered.map(arrival => {
        let seconds = parseInt(arrival.barvlDt) || 0;
        const status = arrival.arvlMsg2 || '';

        // recptnDt濡??쒓컙 蹂댁젙 (?쒓뎅 ?쒓컙? 怨좊젮)
        if (arrival.recptnDt && seconds > 0) {
            try {
                // ?쒖슱??API??"YYYY-MM-DD HH:mm:ss" ?뺤떇??KST 諛섑솚
                // 紐낆떆?곸쑝濡??쒓뎅 ?쒓컙?濡??뚯떛
                let recptnStr = arrival.recptnDt;
                // 怨듬갚??T濡?蹂?섑븯怨??쒓뎅 ?쒓컙? 異붽?
                if (recptnStr.includes(' ') && !recptnStr.includes('T')) {
                    recptnStr = recptnStr.replace(' ', 'T') + '+09:00';
                }
                const recptnTime = new Date(recptnStr).getTime();
                const timeDiff = Math.floor((now - recptnTime) / 1000);

                // ?좏슚??踰붿쐞 ?댁뿉?쒕쭔 蹂댁젙 (0~300珥? 5遺??대궡)
                if (timeDiff > 0 && timeDiff < 300) {
                    seconds = Math.max(0, seconds - timeDiff);
                }
            } catch (e) {
                console.warn('recptnDt ?뚯떛 ?ㅽ뙣:', arrival.recptnDt);
            }
        }

        // ?됱꽑吏 異붿텧 (bstatnNm ?곗꽑, ?놁쑝硫?trainLineNm?먯꽌 異붿텧)
        let destination = arrival.bstatnNm || '';
        if (!destination && arrival.trainLineNm) {
            // "?ㅺ툑??- ??붾갑硫? ?뺥깭?먯꽌 "?ㅺ툑" 異붿텧
            const match = arrival.trainLineNm.match(/^(.+?)??);
            destination = match ? match[1] : arrival.trainLineNm;
        }
        destination = destination.trim();

        return {
            seconds,
            destination: destination + '??,
            destinationKey: destination, // 洹몃９????            status: status,
            trainType: arrival.btrainSttus || '?쇰컲',
            isLast: arrival.lstcarAt === '1',
            trainLineNm: arrival.trainLineNm || ''
        };
    });

    const grouped = {};
    allTrains.forEach(train => {
        const key = train.destinationKey;
        if (!grouped[key]) {
            grouped[key] = [];
        }
        if (grouped[key].length < 3) { // ?됱꽑吏??理쒕? 3媛?(?대쾲, ?ㅼ쓬, ?ㅻ떎??
            grouped[key].push(train);
        }
    });

    // ?쒓컙???뺣젹??洹몃９ 諛곗뿴濡?蹂??    arrivalData = Object.entries(grouped)
        .map(([dest, trains]) => ({
            destination: dest + '??,
            trains: trains.sort((a, b) => a.seconds - b.seconds)
        }))
        .sort((a, b) => a.trains[0].seconds - b.trains[0].seconds); // 泥??댁감 ?꾩갑??
    renderArrivalItems();
}

// 濡쒕뵫 ?쒖떆
function showLoading() {
    arrivalList.innerHTML = `
            < div class="loading" >
            <div class="loading-spinner"></div>
            <span>?꾩갑 ?뺣낫瑜?遺덈윭?ㅻ뒗 以?..</span>
        </div >
            `;
}

// ?곗씠???놁쓬 ?쒖떆
function showNoData() {
    arrivalList.innerHTML = `
            < div class="no-data" >
                <p>?꾩옱 ?꾩갑 ?덉젙 ?댁감媛 ?놁뒿?덈떎</p>
        </div >
            `;
}

// ?먮윭 ?쒖떆
function showError(message) {
    arrivalList.innerHTML = `
            < div class="error" >
                <p>${message}</p>
        </div >
            `;
}

// 利먭꺼李얘린 ?좉?
function toggleFavorite() {
    if (!currentStation) return;

    const key = `${ currentStation.name }_${ currentStation.line } `;
    const index = favorites.findIndex(f => `${ f.name }_${ f.line } ` === key);

    if (index >= 0) {
        favorites.splice(index, 1);
        showToast('利먭꺼李얘린?먯꽌 ??젣?섏뿀?듬땲??);
    } else {
        favorites.push(currentStation);
        showToast('利먭꺼李얘린??異붽??섏뿀?듬땲??);
    }

    saveFavorites();
    updateFavoriteButton();
    renderFavorites();
}

// 利먭꺼李얘린 踰꾪듉 ?곹깭 ?낅뜲?댄듃
function updateFavoriteButton() {
    if (!currentStation) {
        favoriteBtn.classList.remove('active');
        return;
    }

    const key = `${ currentStation.name }_${ currentStation.line } `;
    const isFavorite = favorites.some(f => `${ f.name }_${ f.line } ` === key);
    favoriteBtn.classList.toggle('active', isFavorite);
}

// 利먭꺼李얘린 ?뚮뜑留?function renderFavorites() {
    if (favorites.length === 0) {
        favoritesList.innerHTML = '<span class="no-favorites">利먭꺼李얘린????씠 ?놁뒿?덈떎</span>';
        return;
    }

    favoritesList.innerHTML = favorites.map(station => `
            < div class="favorite-chip" data - station="${station.name}" data - line="${station.line}" >
            <span class="favorite-chip-line" style="background-color: ${getLineColor(station.line)}">
                ${getLineName(station.line)}
            </span>
            <span class="favorite-chip-name">${station.name}</span>
            <button class="favorite-chip-remove" data-station="${station.name}" data-line="${station.line}">&times;</button>
        </div >
            `).join('');

    favoritesList.querySelectorAll('.favorite-chip').forEach(chip => {
        chip.addEventListener('click', (e) => {
            if (e.target.classList.contains('favorite-chip-remove')) {
                const station = {
                    name: e.target.dataset.station,
                    line: e.target.dataset.line
                };
                removeFavorite(station);
            } else {
                selectStation({
                    name: chip.dataset.station,
                    line: chip.dataset.line
                });
            }
        });
    });
}

// 利먭꺼李얘린 ??젣
function removeFavorite(station) {
    const key = `${ station.name }_${ station.line } `;
    favorites = favorites.filter(f => `${ f.name }_${ f.line } ` !== key);
    saveFavorites();
    updateFavoriteButton();
    renderFavorites();
    showToast('利먭꺼李얘린?먯꽌 ??젣?섏뿀?듬땲??);
}

// 利먭꺼李얘린 ???function saveFavorites() {
    localStorage.setItem('subwayTimer_favorites', JSON.stringify(favorites));
}

// 利먭꺼李얘린 濡쒕뱶
function loadFavorites() {
    try {
        const saved = localStorage.getItem('subwayTimer_favorites');
        favorites = saved ? JSON.parse(saved) : [];
    } catch {
        favorites = [];
    }
}

// API ??濡쒕뱶 (?ъ슜?먭? 吏곸젒 ?낅젰???ㅺ? ?덉쑝硫?洹멸구 ?ъ슜)
function loadApiKey() {
    const savedKey = localStorage.getItem('subwayTimer_apiKey');
    if (savedKey) {
        apiKey = savedKey;
    }
}

// ===== ?꾨낫 ?쒓컙 愿由?=====
function loadWalkingTimes() {
    try {
        const saved = localStorage.getItem('subwayTimer_walkingTimes');
        walkingTimes = saved ? JSON.parse(saved) : {};
    } catch {
        walkingTimes = {};
    }
}

function saveWalkingTimes() {
    localStorage.setItem('subwayTimer_walkingTimes', JSON.stringify(walkingTimes));
}

function getStationKey(station) {
    return `${ station.name }_${ station.line } `;
}

function adjustWalkingTime(delta) {
    if (!currentStation) return;

    currentWalkingTime = Math.max(0, Math.min(60, currentWalkingTime + delta));
    walkingTimeValue.textContent = currentWalkingTime;

    const key = getStationKey(currentStation);
    walkingTimes[key] = currentWalkingTime;
    saveWalkingTimes();

    // 異쒕컻 ?뚮┝ 珥덇린??    leaveNotified = false;
    updateLeaveAlert();
}

function loadStationWalkingTime() {
    if (!currentStation) {
        currentWalkingTime = 0;
        walkingTimeValue.textContent = '0';
        return;
    }

    const key = getStationKey(currentStation);
    currentWalkingTime = walkingTimes[key] || 0;
    walkingTimeValue.textContent = currentWalkingTime;
    leaveNotified = false;
}

// ?됱꽑吏 ?좏깮 (?뚮┝ ???
function selectTargetDestination(dest) {
    if (targetDestination === dest) {
        // 媛숈? ?됱꽑吏 ?ㅼ떆 ?대┃?섎㈃ ?댁젣
        targetDestination = null;
        showToast('?뚮┝ ??곸씠 ?댁젣?섏뿀?듬땲?? 媛??鍮좊Ⅸ ?댁감濡??뚮┝');
    } else {
        targetDestination = dest;
        showToast(`${ dest } ?댁감濡 ?? 뚮┝ ?ㅼ젙 ??);
}

// 異쒕컻 ?뚮┝ 珥덇린??    leaveNotified = false;

// UI ?낅뜲?댄듃瑜??꾪빐 lastRenderedData 由ъ뀑
lastRenderedData = null;
renderArrivalItems();
}

// ?뚮┝ ????댁감 李얘린
function getTargetTrain() {
    if (arrivalData.length === 0) return null;

    const isGrouped = arrivalData[0].trains;

    if (isGrouped) {
        // ?뱀젙 ?됱꽑吏媛 ?좏깮??寃쎌슦
        if (targetDestination) {
            const targetGroup = arrivalData.find(g => g.destination === targetDestination);
            if (targetGroup && targetGroup.trains.length > 0) {
                return {
                    train: targetGroup.trains[0],
                    destination: targetGroup.destination
                };
            }
        }
        // ?좏깮 ???먭굅???대떦 ?됱꽑吏媛 ?놁쑝硫?媛??鍮좊Ⅸ ?댁감
        if (arrivalData[0].trains.length > 0) {
            return {
                train: arrivalData[0].trains[0],
                destination: arrivalData[0].destination
            };
        }
    } else {
        // flat 援ъ“
        return {
            train: arrivalData[0],
            destination: arrivalData[0].destination
        };
    }

    return null;
}

// 異쒕컻 ?뚮┝ ?낅뜲?댄듃
function updateLeaveAlert() {
    if (!currentStation || arrivalData.length === 0 || currentWalkingTime === 0) {
        leaveAlert.classList.add('hidden');
        if (displayLeaveAlert) displayLeaveAlert.classList.add('hidden');
        return;
    }

    const target = getTargetTrain();
    if (!target) {
        leaveAlert.classList.add('hidden');
        if (displayLeaveAlert) displayLeaveAlert.classList.add('hidden');
        return;
    }

    const firstTrain = target.train;
    const destination = target.destination;

    const trainSeconds = firstTrain.currentSeconds ?? firstTrain.seconds;
    const walkingSeconds = currentWalkingTime * 60;
    const bufferSeconds = 60; // 1遺??ъ쑀

    // 異쒕컻?댁빞 ?섎뒗 ?쒓컙 = ?댁감 ?꾩갑 ?쒓컙 - ?꾨낫 ?쒓컙 - ?ъ쑀 ?쒓컙
    const leaveInSeconds = trainSeconds - walkingSeconds - bufferSeconds;

    if (leaveInSeconds <= 0) {
        // 吏湲?異쒕컻?댁빞 ??        leaveAlert.classList.remove('hidden', 'warning');
        leaveAlertText.textContent = '吏湲?異쒕컻?섏꽭??';

        if (displayLeaveAlert) {
            displayLeaveAlert.classList.remove('hidden', 'warning');
            displayLeaveText.textContent = '吏湲?異쒕컻!';
        }

        // ?뚮┝ 諛쒖넚 (??踰덈쭔)
        if (!leaveNotified && notifyEnabled) {
            sendNotification(`${first.destination} 열차가 약 1분 후 도착합니다.`);
            leaveNotified = true;
        }
    } else if (leaveInSeconds <= 180) {
        // 3遺??대궡 異쒕컻
        const mins = Math.floor(leaveInSeconds / 60);
        const secs = leaveInSeconds % 60;

        leaveAlert.classList.remove('hidden');
        leaveAlert.classList.add('warning');
        leaveAlertText.textContent = `${mins}遺?${secs}珥???異쒕컻`;

        if (displayLeaveAlert) {
            displayLeaveAlert.classList.remove('hidden');
            displayLeaveAlert.classList.add('warning');
            displayLeaveText.textContent = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')} ??異쒕컻`;
        }
    } else {
        leaveAlert.classList.add('hidden');
        if (displayLeaveAlert) displayLeaveAlert.classList.add('hidden');
    }
}

// ===== ?꾧킅??紐⑤뱶 =====
function enterDisplayMode() {
    if (!currentStation || arrivalData.length === 0) {
        showToast('癒쇱? ??쓣 ?좏깮?댁＜?몄슂');
        return;
    }

    isDisplayMode = true;
    displayMode.classList.remove('hidden');
    document.body.style.overflow = 'hidden';

    // ???뺣낫 ?낅뜲?댄듃
    displayLine.textContent = getLineName(currentStation.line);
    displayLine.style.backgroundColor = getLineColor(currentStation.line);
    displayStationName.textContent = currentStation.name + '??;
    displayDirection.textContent = currentDirection === 'up' ? '?곹뻾' : '?섑뻾';

    // ?꾧킅???낅뜲?댄듃 ?쒖옉
    updateDisplayMode();
    displayInterval = setInterval(updateDisplayMode, 1000);
}

function exitDisplayModeHandler() {
    isDisplayMode = false;
    displayMode.classList.add('hidden');
    document.body.style.overflow = '';

    if (displayInterval) {
        clearInterval(displayInterval);
        displayInterval = null;
    }

    // ?꾩껜?붾㈃ 醫낅즺
    if (document.fullscreenElement) {
        document.exitFullscreen();
    }
}

function updateDisplayMode() {
    if (!isDisplayMode || arrivalData.length === 0) return;

    // ?좏깮???됱꽑吏 ?먮뒗 媛??鍮좊Ⅸ ?댁감
    const target = getTargetTrain();
    if (!target) return;

    const seconds = target.train.currentSeconds ?? target.train.seconds;

    // 硫붿씤 ??대㉧ ?낅뜲?댄듃
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;

    displayDestination.textContent = target.destination;

    // ?곹깭???곕Ⅸ ?됱긽
    displayMinutes.className = 'segment-digits';
    displaySeconds.className = 'segment-digits';

    if (seconds <= 0) {
        // ?꾩갑: segment display ?④린怨?"?꾩갑" ?띿뒪???쒖떆
        segmentDisplay.classList.add('hidden');
        displayArriving.classList.remove('hidden');
    } else {
        // ?쒓컙 ?쒖떆: "?꾩갑" ?④린怨?segment display ?쒖떆
        segmentDisplay.classList.remove('hidden');
        displayArriving.classList.add('hidden');

        displayMinutes.textContent = mins.toString().padStart(2, '0');
        displaySeconds.textContent = secs.toString().padStart(2, '0');

        if (seconds < 60) {
            displayMinutes.classList.add('imminent');
            displaySeconds.classList.add('imminent');
        }
    }

    // ?ㅼ쓬 ?댁감 ?뺣낫 (?좏깮???됱꽑吏???ㅼ쓬 ?댁감??
    const isGrouped = arrivalData[0]?.trains;
    let nextTrains = [];

    if (isGrouped && targetDestination) {
        const targetGroup = arrivalData.find(g => g.destination === targetDestination);
        if (targetGroup && targetGroup.trains.length > 1) {
            nextTrains = targetGroup.trains.slice(1, 3);
        }
    } else if (isGrouped) {
        // ?꾩껜?먯꽌 ?ㅼ쓬 ?댁감??(?ㅻⅨ ?됱꽑吏 ?ы븿)
        const allTrains = arrivalData.flatMap(g => g.trains.map(t => ({ ...t, dest: g.destination })));
        allTrains.sort((a, b) => (a.currentSeconds ?? a.seconds) - (b.currentSeconds ?? b.seconds));
        nextTrains = allTrains.slice(1, 3);
    } else {
        nextTrains = arrivalData.slice(1, 3);
    }

    if (nextTrains[0]) {
        const sec1 = nextTrains[0].currentSeconds ?? nextTrains[0].seconds;
        const m1 = Math.floor(sec1 / 60);
        const s1 = sec1 % 60;
        nextTrain1.querySelector('.next-time').textContent =
            sec1 <= 0 ? '?꾩갑' : `${m1.toString().padStart(2, '0')}:${s1.toString().padStart(2, '0')} `;
    } else {
        nextTrain1.querySelector('.next-time').textContent = '--:--';
    }

    if (nextTrains[1]) {
        const sec2 = nextTrains[1].currentSeconds ?? nextTrains[1].seconds;
        const m2 = Math.floor(sec2 / 60);
        const s2 = sec2 % 60;
        nextTrain2.querySelector('.next-time').textContent =
            sec2 <= 0 ? '?꾩갑' : `${m2.toString().padStart(2, '0')}:${s2.toString().padStart(2, '0')} `;
    } else {
        nextTrain2.querySelector('.next-time').textContent = '--:--';
    }

    // ?쇱옟???낅뜲?댄듃
    updateDisplayCongestion();

    // 異쒕컻 ?뚮┝ ?낅뜲?댄듃
    updateLeaveAlert();
}

function updateDisplayCongestion() {
    const hour = new Date().getHours();
    const day = new Date().getDay();
    const isWeekend = day === 0 || day === 6;

    let level, text;

    if (isWeekend) {
        if (hour >= 12 && hour <= 18) {
            level = 'medium';
            text = '蹂댄넻';
        } else {
            level = 'low';
            text = '?ъ쑀';
        }
    } else {
        if ((hour >= 7 && hour <= 9) || (hour >= 18 && hour <= 20)) {
            level = 'very-high';
            text = '留ㅼ슦?쇱옟';
        } else if ((hour >= 6 && hour < 7) || (hour > 9 && hour <= 10) ||
            (hour >= 17 && hour < 18) || (hour > 20 && hour <= 21)) {
            level = 'high';
            text = '?쇱옟';
        } else if (hour >= 10 && hour <= 17) {
            level = 'medium';
            text = '蹂댄넻';
        } else {
            level = 'low';
            text = '?ъ쑀';
        }
    }

    const dot = displayCongestion.querySelector('.congestion-dot');
    const label = displayCongestion.querySelector('.congestion-label');

    dot.className = 'congestion-dot ' + level;
    label.textContent = text;
}

function toggleFullscreen() {
    if (!document.fullscreenElement) {
        displayMode.requestFullscreen().catch(err => {
            console.log('?꾩껜?붾㈃ ?꾪솚 ?ㅽ뙣:', err);
        });
    } else {
        document.exitFullscreen();
    }
}

// 珥덇린???ㅽ뻾
init();

// 호선명 API 매핑 (서울시 실시간 열차 위치 API 기준)
function getApiLineName(line) {
    const map = {
        '1': '1호선',
        '2': '2호선',
        '3': '3호선',
        '4': '4호선',
        '5': '5호선',
        '6': '6호선',
        '7': '7호선',
        '8': '8호선',
        '9': '9호선',
        '경의중앙': '경의중앙선',
        '공항철도': '공항철도',
        '신분당': '신분당선',
        '수인분당': '수인분당선',
        '경춘': '경춘선',
        '우이신설': '우이신설선',
        '서해': '서해선',
        '김포골드': '김포골드라인',
        '에버라인': '에버라인',
        '의정부': '의정부경전철',
        'GTX-A': 'GTX-A'
    };
    return map[line] || line;
}


// --- 복구된 함수들 ---

function getLineColor(line) {
    return LINE_COLORS[line] || '#00A84D';
}

function getLineName(line) {
    return LINE_NAMES[line] || line;
}

function toggleFavorite() {
    if (!currentStation) return;
    const key = `${currentStation.name}_${currentStation.line}`;
    const exists = favorites.some(f => `${f.name}_${f.line}` === key);
    if (exists) {
        removeFavorite(currentStation);
    } else {
        favorites.push(currentStation);
        saveFavorites();
        updateFavoriteButton();
        renderFavorites();
        showToast('즐겨찾기에 추가되었습니다.');
    }
}

function updateFavoriteButton() {
    if (!currentStation) return;
    const key = `${currentStation.name}_${currentStation.line}`;
    const exists = favorites.some(f => `${f.name}_${f.line}` === key);
    if (exists) {
        favoriteBtn.classList.add('active');
        favoriteBtn.querySelector('svg').style.fill = 'currentColor';
    } else {
        favoriteBtn.classList.remove('active');
        favoriteBtn.querySelector('svg').style.fill = 'none';
    }
}

function renderArrivals(arrivals) {
    const targetUpdn = [];
    if (currentDirection === 'up') {
        targetUpdn.push('상행', '내선');
    } else {
        targetUpdn.push('하행', '외선');
    }

    const filtered = arrivals.filter(train => targetUpdn.includes(train.updnLine));

    const grouped = {};
    filtered.forEach(train => {
        // 행선지 이름 정제
        let destName = train.bstatnNm;
        // 문구 정리 (API 메시지 파싱)
        let message = train.arvlMsg2;
        let seconds = parseInt(train.barvlDt);

        // 도착 메시지 보정
        if (seconds === 0 && !message.includes('도착')) {
            // 시간이 0인데 도착 메시지가 아니면 (진입 등), 시간은 0으로 둠
        }

        if (!grouped[destName]) {
            grouped[destName] = [];
        }
        grouped[destName].push({
            seconds: seconds,
            message: message,
            trainLineNm: train.trainLineNm,
            status: train.arvlMsg2,
            currentSeconds: seconds // 초기값
        });
    });

    arrivalData = Object.keys(grouped).map(dest => ({
        destination: dest,
        trains: grouped[dest].sort((a, b) => a.seconds - b.seconds)
    }));

    if (arrivalData.length === 0) {
        showNoData();
    } else {
        renderArrivalItems();
    }
    startCountdown();
}

// 기타 누락 함수 더미 복구
function updateLeaveAlert() { }
function getTargetTrain() { return null; }
function loadWalkingTimes() {
    try {
        const saved = localStorage.getItem('subwayTimer_walkingTimes');
        walkingTimes = saved ? JSON.parse(saved) : {};
    } catch { walkingTimes = {}; }
}
function loadStationWalkingTime() {
    if (!currentStation) return;
    const key = `${currentStation.name}_${currentStation.line}`;
    currentWalkingTime = walkingTimes[key] || 0;
    walkingTimeValue.textContent = currentWalkingTime;
}
function adjustWalkingTime(delta) {
    if (!currentStation) return;
    currentWalkingTime = Math.max(0, currentWalkingTime + delta);
    walkingTimeValue.textContent = currentWalkingTime;

    const key = `${currentStation.name}_${currentStation.line}`;
    if (currentWalkingTime > 0) {
        walkingTimes[key] = currentWalkingTime;
    } else {
        delete walkingTimes[key];
    }
    localStorage.setItem('subwayTimer_walkingTimes', JSON.stringify(walkingTimes));
    updateLeaveAlert();
}

