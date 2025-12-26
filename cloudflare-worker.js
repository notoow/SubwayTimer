/**
 * Cloudflare Worker - Seoul Subway API Proxy
 *
 * 이 코드를 Cloudflare Workers에 배포하면:
 * 1. API 키가 서버 사이드에 안전하게 보관됨
 * 2. CORS 문제 해결
 * 3. 빠르고 안정적인 응답 (글로벌 엣지 네트워크)
 *
 * 배포 방법:
 * 1. https://dash.cloudflare.com/ 접속
 * 2. Workers & Pages > Create application > Create Worker
 * 3. 이 코드 붙여넣기
 * 4. Settings > Variables > SEOUL_API_KEY 환경변수 추가
 * 5. 배포 후 Worker URL을 app.js에 적용
 */

// 환경변수에서 API 키 가져오기 (Cloudflare 대시보드에서 설정)
// SEOUL_API_KEY 라는 이름으로 환경변수 추가 필요

export default {
    async fetch(request, env) {
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

        // API 키 확인
        const apiKey = env.SEOUL_API_KEY;
        if (!apiKey) {
            return new Response(
                JSON.stringify({ error: 'API 키가 설정되지 않았습니다' }),
                { status: 500, headers: corsHeaders }
            );
        }

        try {
            // 서울시 API 호출
            const apiUrl = `http://swopenapi.seoul.go.kr/api/subway/${apiKey}/json/realtimeStationArrival/0/10/${encodeURIComponent(station)}`;

            const response = await fetch(apiUrl, {
                headers: { 'Accept': 'application/json' }
            });

            const data = await response.json();

            // 성공 응답
            return new Response(
                JSON.stringify(data),
                { headers: corsHeaders }
            );

        } catch (error) {
            return new Response(
                JSON.stringify({ error: error.message }),
                { status: 500, headers: corsHeaders }
            );
        }
    }
};
