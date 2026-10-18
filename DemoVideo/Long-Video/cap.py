import sys, os, time
from playwright.sync_api import sync_playwright
here=os.path.dirname(os.path.abspath(__file__)); os.chdir(here)
N=4680; BUDGET=float(os.environ.get('BUDGET','250'))
ARGS=['--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--font-render-hinting=none']
os.makedirs('frames',exist_ok=True)
todo=[i for i in range(N) if not os.path.exists(f'frames/f{i:04d}.jpg')]
if not todo: print('ALL FRAMES DONE'); sys.exit(0)
with sync_playwright() as p:
    b=p.chromium.launch(args=ARGS); pg=b.new_page(viewport={'width':1920,'height':1080})
    pg.goto('file://'+here+'/index.html'); pg.wait_for_function('window.__ready===true',timeout=60000)
    a=todo[0]
    for i in range(max(0,a-30),a): pg.evaluate(f'render({i/30})')
    t0=time.time(); i=a
    while i<N and time.time()-t0<BUDGET:
        pg.evaluate(f'render({i/30})'); pg.screenshot(path=f'frames/f{i:04d}.jpg',type='jpeg',quality=94); i+=1
    if i==N:
        pg.evaluate('render(3.2)'); pg.screenshot(path='poster.png')
    b.close()
print(f'rendered {a}..{i-1} of {N-1}', 'ALL FRAMES DONE' if i==N else 'run again')
