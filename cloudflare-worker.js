/**
 * Cloudflare Worker - Seoul Subway API Proxy
 * 지원 API:
 * - realtimeStationArrival: 역별 실시간 도착정보
 * - realtimePosition: 호선별 실시간 열차 위치
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
