// 상태 관리
let currentStation = null;
let currentDirection = 'up';
let favorites = [];
let apiKey = '46774f6a4d74616e38394361555279'; // Seoul Open Data API Key (프록시용 백업)
let refreshInterval = null;
let countdownInterval = null;
let arrivalData = [];
let lastFetchTime = null;
let notifyEnabled = false;
let notifyThreshold = 60; // 1분 전 알림
let walkingTimes = {}; // 역별 도보 시간 저장
let currentWalkingTime = 0; // 현재 선택된 역의 도보 시간 (분)
let leaveNotified = false; // 출발 알림 발송 여부

// Cloudflare Worker URL (선택사항 - 배포 후 이 값을 설정하면 더 안정적)
// 예: 'https://subway-api.your-account.workers.dev'
let workerUrl = localStorage.getItem('subwayTimer_workerUrl') || '';

// DOM 요소
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

// URL 파라미터 확인
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

// 이벤트 리스너 설정
function setupEventListeners() {
    // 검색 입력
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

    // 검색 버튼
    searchBtn.addEventListener('click', () => {
        const results = searchStations(stationInput.value);
        if (results.length > 0) {
            selectStation(results[0]);
        }
    });

    // 검색창 외부 클릭시 제안 닫기
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.search-section')) {
            suggestions.classList.remove('active');
        }
    });

    // 방향 탭
    directionTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            currentDirection = tab.dataset.direction;
            directionTabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            if (currentStation) {
                fetchArrivalInfo(currentStation);
                updateCongestion();
                updateUrl();
            }
        });
    });

    // 즐겨찾기 버튼
    favoriteBtn.addEventListener('click', toggleFavorite);

    // 테마 토글
    themeToggle.addEventListener('click', toggleTheme);

    // 새로고침
    refreshBtn.addEventListener('click', handleRefresh);

    // 공유
    shareBtn.addEventListener('click', handleShare);

    // 알림
    notifyBtn.addEventListener('click', toggleNotify);

    // 전광판 모드
    displayModeBtn.addEventListener('click', enterDisplayMode);
    exitDisplayMode.addEventListener('click', exitDisplayModeHandler);

    // ESC 키로 전광판 모드 종료
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && isDisplayMode) {
            exitDisplayModeHandler();
        }
    });

    // 전광판 모드에서 클릭하면 전체화면 토글
    displayMode.addEventListener('dblclick', toggleFullscreen);

    // 도보 시간 조절
    walkingMinus.addEventListener('click', () => adjustWalkingTime(-1));
    walkingPlus.addEventListener('click', () => adjustWalkingTime(1));
}

// 테마 관련
function loadTheme() {
    const theme = localStorage.getItem('subwayTimer_theme') || 'dark';
    document.documentElement.setAttribute('data-theme', theme);
}

function toggleTheme() {
    const current = document.documentElement.getAttribute('data-theme');
    const next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('subwayTimer_theme', next);
}

// 새로고침
function handleRefresh() {
    if (!currentStation) return;

    refreshBtn.classList.add('spinning');
    fetchArrivalInfo(currentStation).finally(() => {
        setTimeout(() => refreshBtn.classList.remove('spinning'), 500);
    });
}

// 공유
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
                title: `${currentStation.name}역 지하철 도착 정보`,
                url: shareUrl
            });
        } catch (e) {
            // 사용자가 취소한 경우
        }
    } else {
        // 클립보드에 복사
        await navigator.clipboard.writeText(shareUrl);
        showToast('링크가 복사되었습니다');
    }
}

// URL 업데이트
function updateUrl() {
    if (!currentStation) return;

    const url = new URL(window.location.href);
    url.searchParams.set('station', currentStation.name);
    url.searchParams.set('line', currentStation.line);
    url.searchParams.set('dir', currentDirection);

    window.history.replaceState({}, '', url.toString());
}

// 알림 토글
async function toggleNotify() {
    if (!notifyEnabled) {
        // 알림 권한 요청
        if ('Notification' in window) {
            const permission = await Notification.requestPermission();
            if (permission === 'granted') {
                notifyEnabled = true;
                notifyBtn.classList.add('active');
                localStorage.setItem('subwayTimer_notify', 'true');
                showToast('도착 1분 전에 알림을 보내드립니다');
            } else {
                showToast('알림 권한이 필요합니다');
            }
        }
    } else {
        notifyEnabled = false;
        notifyBtn.classList.remove('active');
        localStorage.setItem('subwayTimer_notify', 'false');
        showToast('알림이 해제되었습니다');
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

// 토스트 메시지
function showToast(message) {
    toast.textContent = message;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 2500);
}

// 혼잡도 계산 (시간대 기반 통계)
function updateCongestion() {
    const hour = new Date().getHours();
    const day = new Date().getDay();
    const isWeekend = day === 0 || day === 6;

    let level, text;

    if (isWeekend) {
        // 주말
        if (hour >= 12 && hour <= 18) {
            level = 'medium';
            text = '보통';
        } else {
            level = 'low';
            text = '여유';
        }
    } else {
        // 평일
        if ((hour >= 7 && hour <= 9) || (hour >= 18 && hour <= 20)) {
            level = 'very-high';
            text = '매우혼잡';
        } else if ((hour >= 6 && hour < 7) || (hour > 9 && hour <= 10) ||
                   (hour >= 17 && hour < 18) || (hour > 20 && hour <= 21)) {
            level = 'high';
            text = '혼잡';
        } else if (hour >= 10 && hour <= 17) {
            level = 'medium';
            text = '보통';
        } else {
            level = 'low';
            text = '여유';
        }
    }

    congestionFill.className = 'congestion-fill ' + level;
    congestionText.className = 'congestion-text ' + level;
    congestionText.textContent = text;
}

// 마지막 업데이트 시간 표시
function updateLastUpdateTime() {
    const now = new Date();
    const timeStr = now.toLocaleTimeString('ko-KR', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    });
    lastUpdate.textContent = `마지막 업데이트: ${timeStr}`;
}

// 검색 입력 처리
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

// 검색 제안 렌더링
function renderSuggestions(results) {
    suggestions.innerHTML = results.map(station => `
        <div class="suggestion-item" data-station="${station.name}" data-line="${station.line}">
            <span class="suggestion-line" style="background-color: ${getLineColor(station.line)}">
                ${getLineName(station.line)}
            </span>
            <span class="suggestion-name">${station.name}역</span>
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

// 역 선택
function selectStation(station) {
    currentStation = station;
    stationInput.value = station.name;
    suggestions.classList.remove('active');

    // UI 업데이트
    stationName.textContent = station.name + '역';
    lineIndicator.textContent = getLineName(station.line);
    lineIndicator.style.backgroundColor = getLineColor(station.line);
    stationInfo.classList.remove('hidden');

    // 즐겨찾기 상태 업데이트
    updateFavoriteButton();

    // 혼잡도 업데이트
    updateCongestion();

    // 도보 시간 로드
    loadStationWalkingTime();

    // URL 업데이트
    updateUrl();

    // 도착 정보 가져오기
    fetchArrivalInfo(station);

    // 자동 새로고침 설정
    if (refreshInterval) clearInterval(refreshInterval);
    refreshInterval = setInterval(() => {
        fetchArrivalInfo(station);
    }, 30000);
}

// 도착 정보 가져오기
async function fetchArrivalInfo(station) {
    // API 키가 없으면 데모 모드
    if (!apiKey) {
        showDemoMode(station);
        return;
    }

    // 첫 로딩 시에만 로딩 표시 (깜빡거림 방지)
    if (arrivalData.length === 0) {
        showLoading();
    }

    try {
        // 여러 프록시 시도 (안정성 향상)
        const stationName = encodeURIComponent(station.name);
        const apiUrl = `http://swopenapi.seoul.go.kr/api/subway/${apiKey}/json/realtimeStationArrival/0/10/${stationName}`;

        let data = null;
        let lastError = null;

        // 프록시 목록 (순서대로 시도)
        const proxyUrls = [];

        // Cloudflare Worker가 설정되어 있으면 최우선 사용
        if (workerUrl) {
            proxyUrls.push(`${workerUrl}?station=${stationName}`);
        }

        // 백업 프록시들
        proxyUrls.push(
            `https://api.allorigins.win/raw?url=${encodeURIComponent(apiUrl)}`,
            `https://corsproxy.io/?${encodeURIComponent(apiUrl)}`
        );

        for (const url of proxyUrls) {
            try {
                const response = await fetch(url, {
                    timeout: 8000,
                    headers: { 'Accept': 'application/json' }
                });

                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}`);
                }

                const text = await response.text();

                // 빈 응답 체크
                if (!text || text.trim() === '') {
                    throw new Error('빈 응답');
                }

                // JSON 파싱 시도
                try {
                    data = JSON.parse(text);
                } catch (parseError) {
                    console.warn('JSON 파싱 실패:', text.substring(0, 200));
                    throw new Error('JSON 파싱 실패');
                }

                // 성공하면 루프 종료
                break;
            } catch (proxyError) {
                lastError = proxyError;
                console.warn('프록시 실패:', url.substring(0, 50), proxyError.message);
                continue;
            }
        }

        // 모든 프록시 실패
        if (!data) {
            throw lastError || new Error('모든 프록시 실패');
        }

        // API 응답 구조 확인 및 에러 처리
        if (data.status === 500 || data.code === 'INFO-200') {
            showNoData();
            return;
        }

        if (data.errorMessage) {
            if (data.errorMessage.code === 'INFO-200') {
                showNoData();
            } else {
                console.error('API 에러:', data.errorMessage);
                showError(data.errorMessage.message || '데이터를 가져올 수 없습니다');
            }
            return;
        }

        // realtimeArrivalList 확인
        const arrivals = data.realtimeArrivalList;

        if (!arrivals || !Array.isArray(arrivals) || arrivals.length === 0) {
            console.log('도착 데이터 없음:', data);
            showNoData();
            return;
        }

        lastFetchTime = Date.now();
        updateLastUpdateTime();
        renderArrivals(arrivals, station.line);
        startCountdown();

    } catch (error) {
        console.error('API 호출 실패:', error);
        // API 실패 시 데모 모드로 전환
        showDemoMode(station);
    }
}

// 호선별 행선지 데이터
const lineDestinations = {
    '1': { up: ['소요산행', '광운대행', '도봉산행'], down: ['인천행', '신창행', '서동탄행'] },
    '2': { up: ['내선순환', '성수행', '까치산행'], down: ['외선순환', '신도림행', '성수행'] },
    '3': { up: ['대화행', '구파발행', '지축행'], down: ['오금행'] },
    '4': { up: ['당고개행', '노원행'], down: ['오이도행', '안산행', '금정행'] },
    '5': { up: ['방화행', '김포공항행'], down: ['마천행', '상일동행', '하남검단산행'] },
    '6': { up: ['응암행', '응암순환', '새절행'], down: ['신내행', '봉화산행'] },
    '7': { up: ['장암행', '도봉산행'], down: ['청라국제도시행', '온수행'] },
    '8': { up: ['암사행'], down: ['모란행', '별내행'] },
    '9': { up: ['개화행', '김포공항행'], down: ['중앙보훈병원행', '종합운동장행', '언주행'] },
    'K': { up: ['문산행', '일산행', '대곡행'], down: ['용문행', '덕소행', '지평행'] },
    'A': { up: ['서울역행'], down: ['인천공항2터미널행', '검암행'] },
    'S': { up: ['신사행'], down: ['광교행', '광교중앙행'] },
    'U': { up: ['북한산우이행'], down: ['신설동행'] },
    'I': { up: ['청량리행', '왕십리행'], down: ['인천행', '오이도행', '수원행'] },
    'G': { up: ['청량리행', '광운대행'], down: ['춘천행', '가평행'] },
    'E': { up: ['용산행', '서울역행'], down: ['동탄행', '수원행'] }
};

// 데모 모드 표시
function showDemoMode(station) {
    lastFetchTime = Date.now();
    updateLastUpdateTime();

    // 호선에 맞는 행선지 가져오기
    const line = station.line || '2';
    const lineData = lineDestinations[line] || lineDestinations['2'];
    const destinations = currentDirection === 'up' ? lineData.up : lineData.down;

    // 행선지가 부족하면 순환해서 사용
    const getDest = (i) => destinations[i % destinations.length];

    arrivalData = [
        { seconds: 45, destination: getDest(0), status: '전역 출발' },
        { seconds: 180, destination: getDest(1), status: '2역 전' },
        { seconds: 420, destination: getDest(2), status: '4역 전' },
    ];

    renderArrivalItems();
    startCountdown();
}

// 카운트다운 시작
function startCountdown() {
    if (countdownInterval) {
        clearInterval(countdownInterval);
    }

    let notified = new Set();

    countdownInterval = setInterval(() => {
        const elapsed = Math.floor((Date.now() - lastFetchTime) / 1000);

        arrivalData = arrivalData.map(item => ({
            ...item,
            currentSeconds: Math.max(0, item.seconds - elapsed)
        })).filter(item => item.currentSeconds > -30);

        // 알림 체크
        arrivalData.forEach((item, index) => {
            const sec = item.currentSeconds ?? item.seconds;
            if (sec <= notifyThreshold && sec > 0 && !notified.has(index)) {
                notified.add(index);
                sendNotification(`${item.destination} 열차가 약 1분 후 도착합니다`);
            }
        });

        if (arrivalData.length === 0) {
            if (currentStation) {
                fetchArrivalInfo(currentStation);
            }
            return;
        }

        renderArrivalItems();

        // 출발 알림 업데이트
        updateLeaveAlert();
    }, 1000);
}

// 렌더링 상태 추적 (깜빡거림 방지)
let lastRenderedData = null;

// 도착 정보 항목 렌더링 (최적화)
function renderArrivalItems() {
    const lineColor = currentStation ? getLineColor(currentStation.line) : '#00A84D';
    const items = arrivalData.slice(0, 3);

    // 데이터 구조가 변경되었는지 확인 (행선지, 상태 등)
    const currentDataKey = items.map(i => `${i.destination}_${i.trainType}_${i.isLast}`).join('|');
    const needsFullRender = lastRenderedData !== currentDataKey;

    if (needsFullRender) {
        // 전체 다시 렌더링 (데이터 구조 변경 시)
        lastRenderedData = currentDataKey;

        arrivalList.innerHTML = items.map((item, index) => {
            const seconds = item.currentSeconds ?? item.seconds;
            const timeInfo = formatTime(seconds);

            // 급행/막차 뱃지
            let badges = '';
            if (item.trainType === '급행' || item.trainType === 'ITX') {
                badges += `<span class="train-badge express">${item.trainType}</span>`;
            }
            if (item.isLast) {
                badges += `<span class="train-badge last">막차</span>`;
            }

            return `
                <div class="arrival-item ${timeInfo.className}" data-index="${index}" style="--line-color: ${lineColor}">
                    <span class="arrival-order" style="background-color: ${lineColor}">${index + 1}</span>
                    <div class="arrival-info">
                        <div class="arrival-destination">${item.destination}${badges}</div>
                        <div class="arrival-status">${item.status}</div>
                    </div>
                    <div class="arrival-time" data-time-slot="${index}">
                        ${timeInfo.html}
                    </div>
                </div>
            `;
        }).join('');
    } else {
        // 시간만 업데이트 (깜빡거림 방지)
        items.forEach((item, index) => {
            const seconds = item.currentSeconds ?? item.seconds;
            const timeInfo = formatTime(seconds);
            const timeSlot = arrivalList.querySelector(`[data-time-slot="${index}"]`);
            const arrivalItem = arrivalList.querySelector(`[data-index="${index}"]`);

            if (timeSlot) {
                timeSlot.innerHTML = timeInfo.html;
            }

            if (arrivalItem) {
                // 클래스 업데이트 (도착 임박 등)
                arrivalItem.className = `arrival-item ${timeInfo.className}`;
            }
        });
    }
}

// 시간 포맷
function formatTime(seconds) {
    if (seconds <= 0) {
        return {
            html: '<span class="time-value">도착</span>',
            className: 'arriving'
        };
    }

    if (seconds < 60) {
        return {
            html: `<span class="time-value">${seconds}</span><span class="time-unit">초</span>`,
            className: 'imminent'
        };
    }

    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;

    if (minutes < 3) {
        return {
            html: `<span class="time-value">${minutes}:${secs.toString().padStart(2, '0')}</span>`,
            className: 'imminent'
        };
    }

    return {
        html: `<span class="time-value">${minutes}</span><span class="time-unit">분</span>`,
        className: ''
    };
}

// 도착 정보 렌더링 (API 응답 처리)
function renderArrivals(arrivals, selectedLine) {
    const filtered = arrivals.filter(arrival => {
        const isMatchingDirection = arrival.updnLine.includes(currentDirection === 'up' ? '상행' : '하행') ||
                                    arrival.updnLine.includes(currentDirection === 'up' ? '내선' : '외선');
        return isMatchingDirection;
    });

    if (filtered.length === 0) {
        showNoData();
        return;
    }

    const now = Date.now();

    arrivalData = filtered.slice(0, 3).map(arrival => {
        let seconds = parseInt(arrival.barvlDt) || 0;

        // recptnDt 기반 시간 보정 (API 문서 권장사항)
        // 데이터 생성 시각과 현재 시각의 차이만큼 빼줌
        if (arrival.recptnDt) {
            const recptnTime = new Date(arrival.recptnDt).getTime();
            const timeDiff = Math.floor((now - recptnTime) / 1000);
            if (timeDiff > 0 && timeDiff < 300) { // 5분 이내만 보정
                seconds = Math.max(0, seconds - timeDiff);
            }
        }

        return {
            seconds,
            destination: arrival.trainLineNm || (arrival.bstatnNm + '행'),
            status: arrival.arvlMsg2 || '',
            trainType: arrival.btrainSttus || '일반', // 급행/일반
            isLast: arrival.lstcarAt === '1' // 막차 여부
        };
    });

    renderArrivalItems();
}

// 로딩 표시
function showLoading() {
    arrivalList.innerHTML = `
        <div class="loading">
            <div class="loading-spinner"></div>
            <span>도착 정보를 불러오는 중...</span>
        </div>
    `;
}

// 데이터 없음 표시
function showNoData() {
    arrivalList.innerHTML = `
        <div class="no-data">
            <p>현재 도착 예정 열차가 없습니다</p>
        </div>
    `;
}

// 에러 표시
function showError(message) {
    arrivalList.innerHTML = `
        <div class="error">
            <p>${message}</p>
        </div>
    `;
}

// 즐겨찾기 토글
function toggleFavorite() {
    if (!currentStation) return;

    const key = `${currentStation.name}_${currentStation.line}`;
    const index = favorites.findIndex(f => `${f.name}_${f.line}` === key);

    if (index >= 0) {
        favorites.splice(index, 1);
        showToast('즐겨찾기에서 삭제되었습니다');
    } else {
        favorites.push(currentStation);
        showToast('즐겨찾기에 추가되었습니다');
    }

    saveFavorites();
    updateFavoriteButton();
    renderFavorites();
}

// 즐겨찾기 버튼 상태 업데이트
function updateFavoriteButton() {
    if (!currentStation) {
        favoriteBtn.classList.remove('active');
        return;
    }

    const key = `${currentStation.name}_${currentStation.line}`;
    const isFavorite = favorites.some(f => `${f.name}_${f.line}` === key);
    favoriteBtn.classList.toggle('active', isFavorite);
}

// 즐겨찾기 렌더링
function renderFavorites() {
    if (favorites.length === 0) {
        favoritesList.innerHTML = '<span class="no-favorites">즐겨찾기한 역이 없습니다</span>';
        return;
    }

    favoritesList.innerHTML = favorites.map(station => `
        <div class="favorite-chip" data-station="${station.name}" data-line="${station.line}">
            <span class="favorite-chip-line" style="background-color: ${getLineColor(station.line)}">
                ${getLineName(station.line)}
            </span>
            <span class="favorite-chip-name">${station.name}</span>
            <button class="favorite-chip-remove" data-station="${station.name}" data-line="${station.line}">&times;</button>
        </div>
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

// 즐겨찾기 삭제
function removeFavorite(station) {
    const key = `${station.name}_${station.line}`;
    favorites = favorites.filter(f => `${f.name}_${f.line}` !== key);
    saveFavorites();
    updateFavoriteButton();
    renderFavorites();
    showToast('즐겨찾기에서 삭제되었습니다');
}

// 즐겨찾기 저장
function saveFavorites() {
    localStorage.setItem('subwayTimer_favorites', JSON.stringify(favorites));
}

// 즐겨찾기 로드
function loadFavorites() {
    try {
        const saved = localStorage.getItem('subwayTimer_favorites');
        favorites = saved ? JSON.parse(saved) : [];
    } catch {
        favorites = [];
    }
}

// API 키 로드 (사용자가 직접 입력한 키가 있으면 그걸 사용)
function loadApiKey() {
    const savedKey = localStorage.getItem('subwayTimer_apiKey');
    if (savedKey) {
        apiKey = savedKey;
    }
}

// ===== 도보 시간 관리 =====
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
    return `${station.name}_${station.line}`;
}

function adjustWalkingTime(delta) {
    if (!currentStation) return;

    currentWalkingTime = Math.max(0, Math.min(60, currentWalkingTime + delta));
    walkingTimeValue.textContent = currentWalkingTime;

    // 저장
    const key = getStationKey(currentStation);
    walkingTimes[key] = currentWalkingTime;
    saveWalkingTimes();

    // 출발 알림 초기화
    leaveNotified = false;
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

// 출발 알림 업데이트
function updateLeaveAlert() {
    if (!currentStation || arrivalData.length === 0 || currentWalkingTime === 0) {
        leaveAlert.classList.add('hidden');
        if (displayLeaveAlert) displayLeaveAlert.classList.add('hidden');
        return;
    }

    const first = arrivalData[0];
    const trainSeconds = first.currentSeconds ?? first.seconds;
    const walkingSeconds = currentWalkingTime * 60;
    const bufferSeconds = 60; // 1분 여유

    // 출발해야 하는 시간 = 열차 도착 시간 - 도보 시간 - 여유 시간
    const leaveInSeconds = trainSeconds - walkingSeconds - bufferSeconds;

    if (leaveInSeconds <= 0) {
        // 지금 출발해야 함
        leaveAlert.classList.remove('hidden', 'warning');
        leaveAlertText.textContent = '지금 출발하세요!';

        if (displayLeaveAlert) {
            displayLeaveAlert.classList.remove('hidden', 'warning');
            displayLeaveText.textContent = '지금 출발!';
        }

        // 알림 발송 (한 번만)
        if (!leaveNotified && notifyEnabled) {
            sendNotification(`${currentStation.name}역으로 지금 출발하세요! ${first.destination} 열차가 곧 도착합니다.`);
            leaveNotified = true;
        }
    } else if (leaveInSeconds <= 180) {
        // 3분 이내 출발
        const mins = Math.floor(leaveInSeconds / 60);
        const secs = leaveInSeconds % 60;

        leaveAlert.classList.remove('hidden');
        leaveAlert.classList.add('warning');
        leaveAlertText.textContent = `${mins}분 ${secs}초 후 출발`;

        if (displayLeaveAlert) {
            displayLeaveAlert.classList.remove('hidden');
            displayLeaveAlert.classList.add('warning');
            displayLeaveText.textContent = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')} 후 출발`;
        }
    } else {
        leaveAlert.classList.add('hidden');
        if (displayLeaveAlert) displayLeaveAlert.classList.add('hidden');
    }
}

// ===== 전광판 모드 =====
function enterDisplayMode() {
    if (!currentStation || arrivalData.length === 0) {
        showToast('먼저 역을 선택해주세요');
        return;
    }

    isDisplayMode = true;
    displayMode.classList.remove('hidden');
    document.body.style.overflow = 'hidden';

    // 역 정보 업데이트
    displayLine.textContent = getLineName(currentStation.line);
    displayLine.style.backgroundColor = getLineColor(currentStation.line);
    displayStationName.textContent = currentStation.name + '역';
    displayDirection.textContent = currentDirection === 'up' ? '상행' : '하행';

    // 전광판 업데이트 시작
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

    // 전체화면 종료
    if (document.fullscreenElement) {
        document.exitFullscreen();
    }
}

function updateDisplayMode() {
    if (!isDisplayMode || arrivalData.length === 0) return;

    const first = arrivalData[0];
    const seconds = first.currentSeconds ?? first.seconds;

    // 메인 타이머 업데이트
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;

    displayMinutes.textContent = mins.toString().padStart(2, '0');
    displaySeconds.textContent = secs.toString().padStart(2, '0');
    displayDestination.textContent = first.destination;

    // 상태에 따른 색상
    displayMinutes.className = 'segment-digits';
    displaySeconds.className = 'segment-digits';

    if (seconds <= 0) {
        displayMinutes.textContent = '도';
        displaySeconds.textContent = '착';
        displayMinutes.classList.add('arriving');
        displaySeconds.classList.add('arriving');
    } else if (seconds < 60) {
        displayMinutes.classList.add('imminent');
        displaySeconds.classList.add('imminent');
    }

    // 다음 열차 정보
    if (arrivalData[1]) {
        const sec1 = arrivalData[1].currentSeconds ?? arrivalData[1].seconds;
        const m1 = Math.floor(sec1 / 60);
        const s1 = sec1 % 60;
        nextTrain1.querySelector('.next-time').textContent =
            sec1 <= 0 ? '도착' : `${m1.toString().padStart(2, '0')}:${s1.toString().padStart(2, '0')}`;
    } else {
        nextTrain1.querySelector('.next-time').textContent = '--:--';
    }

    if (arrivalData[2]) {
        const sec2 = arrivalData[2].currentSeconds ?? arrivalData[2].seconds;
        const m2 = Math.floor(sec2 / 60);
        const s2 = sec2 % 60;
        nextTrain2.querySelector('.next-time').textContent =
            sec2 <= 0 ? '도착' : `${m2.toString().padStart(2, '0')}:${s2.toString().padStart(2, '0')}`;
    } else {
        nextTrain2.querySelector('.next-time').textContent = '--:--';
    }

    // 혼잡도 업데이트
    updateDisplayCongestion();

    // 출발 알림 업데이트
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
            text = '보통';
        } else {
            level = 'low';
            text = '여유';
        }
    } else {
        if ((hour >= 7 && hour <= 9) || (hour >= 18 && hour <= 20)) {
            level = 'very-high';
            text = '매우혼잡';
        } else if ((hour >= 6 && hour < 7) || (hour > 9 && hour <= 10) ||
                   (hour >= 17 && hour < 18) || (hour > 20 && hour <= 21)) {
            level = 'high';
            text = '혼잡';
        } else if (hour >= 10 && hour <= 17) {
            level = 'medium';
            text = '보통';
        } else {
            level = 'low';
            text = '여유';
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
            console.log('전체화면 전환 실패:', err);
        });
    } else {
        document.exitFullscreen();
    }
}

// 초기화 실행
init();
