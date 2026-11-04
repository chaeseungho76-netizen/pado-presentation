# 발표 페이지용 로컬 서버: 브라우저가 예전 파일을 기억하지 않도록 매번 새로 보낸다.
# 서버가 준비된 뒤에 브라우저를 연다.
import http.server, socketserver, sys, webbrowser

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8080

class NoCache(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

socketserver.TCPServer.allow_reuse_address = True
with socketserver.TCPServer(("", PORT), NoCache) as httpd:
    url = f"http://localhost:{PORT}"
    print(f"파도 발표 페이지: {url}  (이 창을 닫으면 끝납니다)")
    webbrowser.open(url)
    httpd.serve_forever()
