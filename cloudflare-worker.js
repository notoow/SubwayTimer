/**
 * Cloudflare Worker - Seoul Subway API Proxy
 * 지원 API:
 * - realtimeStationArrival: 역별 실시간 도착정보
 * - realtimePosition: 호선별 실시간 열차 위치
 * - crawl: 서울교통공사 크롤링 (더 정확한 실시간 위치)
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

        // API 키 (각 API별로 다른 키 사용)
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
                        updnLine: match[1].slice(-1) % 2 === 0 ? '상행' : '하행', // 짝수=상행, 홀수=하행 (일반적 규칙)
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

            let apiUrl;

            if (type === 'position' && line) {
                // 실시간 열차 위치 API (호선별) - 전용 키 사용
                const lineName = decodeURIComponent(line);
                apiUrl = `http://swopenapi.seoul.go.kr/api/subway/${positionKey}/json/realtimePosition/0/100/${encodeURIComponent(lineName)}`;
            } else if (station) {
                // 실시간 도착정보 API (역별)
                const decodedStation = decodeURIComponent(station);
                apiUrl = `http://swopenapi.seoul.go.kr/api/subway/${arrivalKey}/json/realtimeStationArrival/0/20/${encodeURIComponent(decodedStation)}`;
            } else {
                return new Response(
                    JSON.stringify({ error: 'station 또는 line 파라미터가 필요합니다' }),
                    { status: 400, headers: corsHeaders }
                );
            }

            // 캐시 방지를 위해 타임스탬프 추가
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
