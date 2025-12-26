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
            'Content-Type': 'application/json; charset=utf-8'
        };

        if (request.method === 'OPTIONS') {
            return new Response(null, { headers: corsHeaders });
        }

        const url = new URL(request.url);
        const type = url.searchParams.get('type') || 'arrival'; // arrival | position
        const station = url.searchParams.get('station');
        const line = url.searchParams.get('line');

        // API 키 (환경변수 또는 백업)
        const apiKey = env.SEOUL_API_KEY || '585858626a74616e38375961745252';

        try {
            let apiUrl;

            if (type === 'position' && line) {
                // 실시간 열차 위치 API (호선별)
                const lineName = decodeURIComponent(line);
                apiUrl = `http://swopenapi.seoul.go.kr/api/subway/${apiKey}/json/realtimePosition/0/100/${encodeURIComponent(lineName)}`;
            } else if (station) {
                // 실시간 도착정보 API (역별)
                const decodedStation = decodeURIComponent(station);
                apiUrl = `http://swopenapi.seoul.go.kr/api/subway/${apiKey}/json/realtimeStationArrival/0/20/${encodeURIComponent(decodedStation)}`;
            } else {
                return new Response(
                    JSON.stringify({ error: 'station 또는 line 파라미터가 필요합니다' }),
                    { status: 400, headers: corsHeaders }
                );
            }

            const response = await fetch(apiUrl, {
                headers: { 'Accept': 'application/json' }
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
