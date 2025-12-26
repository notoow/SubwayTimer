// 상태 관리
let currentStation = null;
let currentDirection = 'up';
let favorites = [];
let apiKey = '';
let refreshInterval = null;
let countdownInterval = null;
let arrivalData = []; // 현재 표시중인 도착 정보
let lastFetchTime = null; // 마지막 API 호출 시간

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
const apiKeyInput = document.getElementById('apiKeyInput');
const saveApiKeyBtn = document.getElementById('saveApiKey');

// 초기화
function init() {
    loadApiKey();
    loadFavorites();
    setupEventListeners();
    renderFavorites();
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
            }
        });
    });

    // 즐겨찾기 버튼
    favoriteBtn.addEventListener('click', toggleFavorite);

    // API 키 저장
    saveApiKeyBtn.addEventListener('click', saveApiKey);
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

    // 클릭 이벤트 추가
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

    // 도착 정보 가져오기
    fetchArrivalInfo(station);

    // 자동 새로고침 설정
    if (refreshInterval) clearInterval(refreshInterval);
    refreshInterval = setInterval(() => {
        fetchArrivalInfo(station);
    }, 30000); // 30초마다 새로고침
}

// 도착 정보 가져오기
async function fetchArrivalInfo(station) {
    // API 키가 없으면 데모 모드
    if (!apiKey) {
        showDemoMode(station);
        return;
    }

    showLoading();

    try {
        // 서울시 열린데이터광장 API
        const url = `http://swopenapi.seoul.go.kr/api/subway/${apiKey}/json/realtimeStationArrival/0/10/${encodeURIComponent(station.name)}`;

        const response = await fetch(url);
        const data = await response.json();

        if (data.status === 500 || data.code === 'INFO-200') {
            showNoData();
            return;
        }

        if (data.errorMessage) {
            if (data.errorMessage.code === 'INFO-200') {
                showNoData();
            } else {
                showError(data.errorMessage.message || '데이터를 가져올 수 없습니다');
            }
            return;
        }

        const arrivals = data.realtimeArrivalList || [];
        lastFetchTime = Date.now();
        renderArrivals(arrivals, station.line);
        startCountdown();

    } catch (error) {
        console.error('API 호출 실패:', error);
        // CORS 에러 등의 경우 데모 모드 안내
        showDemoMode(station);
    }
}

// 데모 모드 표시
function showDemoMode(station) {
    lastFetchTime = Date.now();

    // 데모 데이터 생성
    const destinations = currentDirection === 'up'
        ? ['서울역행', '청량리행', '의정부행']
        : ['인천행', '신도림행', '구로행'];

    arrivalData = [
        { seconds: 45, destination: destinations[0], status: '전역 출발' },
        { seconds: 180, destination: destinations[1], status: '2역 전 (잠실)' },
        { seconds: 420, destination: destinations[2], status: '4역 전' },
    ];

    renderArrivalItems();
    startCountdown();
}

// 카운트다운 시작
function startCountdown() {
    if (countdownInterval) {
        clearInterval(countdownInterval);
    }

    countdownInterval = setInterval(() => {
        const elapsed = Math.floor((Date.now() - lastFetchTime) / 1000);

        arrivalData = arrivalData.map(item => ({
            ...item,
            currentSeconds: Math.max(0, item.seconds - elapsed)
        })).filter(item => item.currentSeconds > -30); // 지나간 열차는 30초 후 제거

        if (arrivalData.length === 0) {
            // 데이터가 없으면 새로고침
            if (currentStation) {
                fetchArrivalInfo(currentStation);
            }
            return;
        }

        renderArrivalItems();
    }, 1000);
}

// 도착 정보 항목 렌더링
function renderArrivalItems() {
    const lineColor = currentStation ? getLineColor(currentStation.line) : '#00A84D';

    arrivalList.innerHTML = arrivalData.slice(0, 3).map((item, index) => {
        const seconds = item.currentSeconds ?? item.seconds;
        const timeInfo = formatTime(seconds);

        return `
            <div class="arrival-item ${timeInfo.className}" style="--line-color: ${lineColor}">
                <span class="arrival-order" style="background-color: ${lineColor}">${index + 1}</span>
                <div class="arrival-info">
                    <div class="arrival-destination">${item.destination}</div>
                    <div class="arrival-status">${item.status}</div>
                </div>
                <div class="arrival-time">
                    ${timeInfo.html}
                </div>
            </div>
        `;
    }).join('');
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
    // 방향 필터링
    const filtered = arrivals.filter(arrival => {
        const isMatchingDirection = arrival.updnLine.includes(currentDirection === 'up' ? '상행' : '하행') ||
                                    arrival.updnLine.includes(currentDirection === 'up' ? '내선' : '외선');
        return isMatchingDirection;
    });

    if (filtered.length === 0) {
        showNoData();
        return;
    }

    // 도착 데이터 변환
    arrivalData = filtered.slice(0, 3).map(arrival => ({
        seconds: parseInt(arrival.barvlDt) || 0,
        destination: arrival.trainLineNm || (arrival.bstatnNm + '행'),
        status: arrival.arvlMsg2 || ''
    }));

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
    } else {
        favorites.push(currentStation);
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

    // 클릭 이벤트 추가
    favoritesList.querySelectorAll('.favorite-chip').forEach(chip => {
        chip.addEventListener('click', (e) => {
            if (e.target.classList.contains('favorite-chip-remove')) {
                // 삭제 버튼 클릭
                const station = {
                    name: e.target.dataset.station,
                    line: e.target.dataset.line
                };
                removeFavorite(station);
            } else {
                // 칩 클릭 - 역 선택
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

// API 키 저장
function saveApiKey() {
    apiKey = apiKeyInput.value.trim();
    localStorage.setItem('subwayTimer_apiKey', apiKey);
    apiKeyInput.value = '';

    if (currentStation) {
        fetchArrivalInfo(currentStation);
    }
}

// API 키 로드
function loadApiKey() {
    apiKey = localStorage.getItem('subwayTimer_apiKey') || '';
    if (apiKey) {
        apiKeyInput.placeholder = 'API 키가 저장되어 있습니다';
    }
}

// 초기화 실행
init();
