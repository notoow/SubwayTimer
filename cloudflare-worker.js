/**
 * Cloudflare Worker - Seoul Subway API Proxy
 * 지원 API:
 * - realtimeStationArrival: 역별 실시간 도착정보
 * - realtimePosition: 호선별 실시간 열차 위치
 * - crawl: 서울교통공사 크롤링 (더 정확한 실시간 위치)
 * - timetable: 역별 열차 시간표 (폴백용)
 */

export default {
    async fetch(request, env, ctx) {
        const corsHeaders = {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type',
            'Content-Type': 'application/json; charset=utf-8',
            'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
            'Pragma': 'no-cache'
        };

        if (request.method === 'OPTIONS') {
            return new Response(null, { headers: corsHeaders });
        }

        const url = new URL(request.url);
        const type = url.searchParams.get('type') || 'arrival';
        const station = url.searchParams.get('station');
        const line = url.searchParams.get('line');

        // API 키
        const arrivalKey = env.SEOUL_API_KEY || '46774f6a4d74616e38394361555279';
        const positionKey = env.SEOUL_POSITION_KEY || '585858626a74616e38375961745252';

        try {
            // 서울교통공사 크롤링 (1~8호선만 지원)
            if (type === 'crawl' && line) {
                const lineNum = line.replace(/[^0-9]/g, '');
                if (!lineNum || parseInt(lineNum) < 1 || parseInt(lineNum) > 8) {
                    return new Response(
                        JSON.stringify({ error: '크롤링은 1~8호선만 지원합니다', trains: [] }),
                        { headers: corsHeaders }
                    );
                }

                const crawlResponse = await fetch('https://smss.seoulmetro.co.kr/traininfo/traininfoUserMap.do', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded',
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                    },
                    body: `line=${lineNum}&isCb=N`
                });

                const html = await crawlResponse.text();

                // 열차 정보 파싱: "3150열차  학여울 도착 대화행"
                const trainRegex = /title="(\d+)열차\s+([^\s]+)\s+(도착|접근|이동|출발|진입)\s+([^"]+)행"/g;
                const trains = [];
                let match;

                while ((match = trainRegex.exec(html)) !== null) {
                    trains.push({
                        trainNo: match[1],
                        statnNm: match[2],
                        status: match[3],
                        destination: match[4],
                        updnLine: match[1].slice(-1) % 2 === 0 ? '상행' : '하행',
                        timestamp: Date.now()
                    });
                }

                return new Response(
                    JSON.stringify({
                        source: 'seoulmetro_crawl',
                        line: lineNum,
                        trainCount: trains.length,
                        trains,
                        timestamp: new Date().toISOString()
                    }),
                    { headers: corsHeaders }
                );
            }

            // 열차 시간표 API (1~8호선만)
            if (type === 'timetable' && station && line) {
                const stationName = decodeURIComponent(station);
                const lineNum = line.replace(/[^0-9]/g, '');
                const updown = url.searchParams.get('updown') || '1'; // 1=상행/외선, 2=하행/내선

                // 요일 판단 (한국 시간 기준)
                const now = new Date();
                const koreaTime = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Seoul' }));
                const day = koreaTime.getDay();
                let weekTag = '1'; // 평일
                if (day === 0) weekTag = '3'; // 일요일/공휴일
                else if (day === 6) weekTag = '2'; // 토요일

                // 1단계: 역명으로 역코드 조회
                const searchUrl = `http://swopenapi.seoul.go.kr/api/subway/${arrivalKey}/json/SearchInfoBySubwayNameService/1/5/${encodeURIComponent(stationName)}`;
                const searchRes = await fetch(searchUrl);
                const searchData = await searchRes.json();

                if (!searchData.SearchInfoBySubwayNameService?.row?.length) {
                    return new Response(
                        JSON.stringify({ error: '역을 찾을 수 없습니다', timetable: [] }),
                        { headers: corsHeaders }
                    );
                }

                // 해당 호선의 역코드 찾기
                const stationInfo = searchData.SearchInfoBySubwayNameService.row.find(
                    r => r.LINE_NUM === `0${lineNum}호선` || r.LINE_NUM === `${lineNum}호선`
                );

                if (!stationInfo) {
                    return new Response(
                        JSON.stringify({ error: '해당 호선의 역을 찾을 수 없습니다', timetable: [] }),
                        { headers: corsHeaders }
                    );
                }

                const stationCode = stationInfo.FR_CODE;

                // 2단계: 역코드로 시간표 조회
                const timetableUrl = `http://swopenapi.seoul.go.kr/api/subway/${arrivalKey}/json/SearchSTNTimeTableByFRCodeService/1/100/${stationCode}/${weekTag}/${updown}`;
                const ttRes = await fetch(timetableUrl);
                const ttData = await ttRes.json();

                if (!ttData.SearchSTNTimeTableByFRCodeService?.row?.length) {
                    return new Response(
                        JSON.stringify({ error: '시간표를 찾을 수 없습니다', timetable: [] }),
                        { headers: corsHeaders }
                    );
                }

                // 현재 시간 이후의 열차만 필터링
                const currentTime = koreaTime.getHours() * 100 + koreaTime.getMinutes();
                const timetable = ttData.SearchSTNTimeTableByFRCodeService.row
                    .map(t => {
                        const timeStr = t.ARRIVETIME || t.LEFTTIME || '';
                        const [h, m, s] = timeStr.split(':').map(Number);
                        const timeNum = h * 100 + m;
                        return {
                            trainNo: t.TRAIN_NO,
                            destination: t.SUBWAYENAME || t.SUBWAYSNAME,
                            arriveTime: timeStr,
                            timeNum,
                            isExpress: t.EXPRESS_YN === 'G',
                            direction: updown === '1' ? '상행' : '하행'
                        };
                    })
                    .filter(t => t.timeNum >= currentTime)
                    .slice(0, 10); // 최대 10개

                return new Response(
                    JSON.stringify({
                        source: 'timetable',
                        station: stationName,
                        line: lineNum,
                        stationCode,
                        weekday: weekTag === '1' ? '평일' : weekTag === '2' ? '토요일' : '휴일',
                        direction: updown === '1' ? '상행/외선' : '하행/내선',
                        timetable,
                        timestamp: new Date().toISOString()
                    }),
                    { headers: corsHeaders }
                );
            }

            let apiUrl;

            if (type === 'position' && line) {
                const lineName = decodeURIComponent(line);
                apiUrl = `http://swopenapi.seoul.go.kr/api/subway/${positionKey}/json/realtimePosition/0/100/${encodeURIComponent(lineName)}`;
            } else if (station) {
                const decodedStation = decodeURIComponent(station);
                apiUrl = `http://swopenapi.seoul.go.kr/api/subway/${arrivalKey}/json/realtimeStationArrival/0/20/${encodeURIComponent(decodedStation)}`;
            } else {
                return new Response(
                    JSON.stringify({ error: 'station 또는 line 파라미터가 필요합니다' }),
                    { status: 400, headers: corsHeaders }
                );
            }

            const separator = apiUrl.includes('?') ? '&' : '?';
            const noCacheUrl = `${apiUrl}${separator}_t=${Date.now()}`;

            const response = await fetch(noCacheUrl, {
                headers: { 'Accept': 'application/json' },
                cf: { cacheTtl: 0, cacheEverything: false }
            });

            const text = await response.text();
            return new Response(text, { headers: corsHeaders });

        } catch (error) {
            return new Response(
                JSON.stringify({ error: error.message }),
                { status: 500, headers: corsHeaders }
            );
        }
    }
};
