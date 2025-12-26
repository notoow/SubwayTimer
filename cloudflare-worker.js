/**
 * Cloudflare Worker - Seoul Subway API Proxy
 */

export default {
    async fetch(request, env, ctx) {
        // CORS 헤더
        const corsHeaders = {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type',
            'Content-Type': 'application/json; charset=utf-8'
        };

        // OPTIONS 요청 처리 (CORS preflight)
        if (request.method === 'OPTIONS') {
            return new Response(null, { headers: corsHeaders });
        }

        // URL 파싱
        const url = new URL(request.url);
        const station = url.searchParams.get('station');

        if (!station) {
            return new Response(
                JSON.stringify({ error: 'station 파라미터가 필요합니다' }),
                { status: 400, headers: corsHeaders }
            );
        }

        // API 키 확인 (환경변수 또는 하드코딩된 백업)
        const apiKey = env.SEOUL_API_KEY || '46774f6a4d74616e38394361555279';

        try {
            // 서울시 API 호출 (station은 이미 인코딩된 상태로 들어옴)
            const decodedStation = decodeURIComponent(station);
            const apiUrl = `http://swopenapi.seoul.go.kr/api/subway/${apiKey}/json/realtimeStationArrival/0/10/${encodeURIComponent(decodedStation)}`;

            const response = await fetch(apiUrl, {
                headers: { 'Accept': 'application/json' }
            });

            const text = await response.text();

            // 응답 전달
            return new Response(text, { headers: corsHeaders });

        } catch (error) {
            return new Response(
                JSON.stringify({ error: error.message }),
                { status: 500, headers: corsHeaders }
            );
        }
    }
};
