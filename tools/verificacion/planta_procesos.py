# Planta «Del río a la llave»: pestaña Procesos (escritorio 1440 × 860). Recorre los once pasos con el botón
# «siguiente», revisa que cada uno muestre su lupa, sus valores y su fuente, que las once etiquetas de la escena
# se vean en la vista general, que el retrolavado funcione y que se gane la medalla «Los once pasos».
# Capturas en /home/claude/shots/diag. Imprime un resumen y los errores de consola.
from playwright.sync_api import sync_playwright
OUT='/home/claude/shots/diag'
ARGS=['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/usr/bin/google-chrome',args=ARGS)
    pg=b.new_page(viewport={'width':1440,'height':860})
    logs=[]
    pg.on('console', lambda m: logs.append(f'{m.type}: {m.text}') if m.type=='error' else None)
    pg.on('pageerror', lambda e: logs.append(f'pageerror: {e}'))
    pg.goto('http://127.0.0.1:5173/'); pg.wait_for_timeout(900)
    pg.evaluate("() => localStorage.clear()"); pg.reload(); pg.wait_for_timeout(900)
    pg.get_by_role('button', name='Calidad del agua').click(); pg.wait_for_timeout(1500)
    pg.get_by_role('tab', name='Del río a la llave').click(); pg.wait_for_timeout(5000)
    vis = pg.evaluate("() => [...document.querySelectorAll('.q3-label')].filter(e => e.style.visibility === 'visible').length")
    print(f'etiquetas visibles en la vista general: {vis} de 11')
    pg.screenshot(path=f'{OUT}/pp-0-general.png')
    rows=[]
    for k in range(11):
        h = pg.locator('#q3-proc-h').inner_text()
        n = pg.locator('.q3-proc-n').inner_text()
        lens = pg.locator('.q3-proc-lens svg').count()
        io = pg.locator('.q3-io dd').all_inner_texts()
        src = pg.locator('.q3-src').inner_text()
        rows.append((n, h, lens, len(io), 'NaN' in ' '.join(io), src[:60]))
        if k < 10:
            pg.locator('.q3-procnav button').last.click(); pg.wait_for_timeout(1800)
            if k in (1, 4, 6): pg.screenshot(path=f'{OUT}/pp-{k+2}.png')
    for r in rows: print(' | '.join(str(x) for x in r))
    pg.locator('.q3-steps button', has_text='Filtración rápida').click(); pg.wait_for_timeout(2000)
    pg.get_by_role('button', name='Lavar los filtros (retrolavado)').click(); pg.wait_for_timeout(2500)
    pg.screenshot(path=f'{OUT}/pp-lavado.png')
    print('lavando:', pg.get_by_role('button', name='Lavando los filtros…').count() == 1)
    pg.wait_for_timeout(6000)
    print('lavado terminado:', pg.get_by_role('button', name='Lavar los filtros (retrolavado)').count() == 1)
    # clic en la escena: el tanque de almacenamiento (vista de salida)
    pg.locator('.q3-views button', has_text='Salida').click(); pg.wait_for_timeout(2600)
    retos = pg.evaluate("() => localStorage.getItem('ciclo-hidrologico:calidad-retos')")
    print('retos:', retos)
    print('medalla de los once pasos:', 'p-recorrido' in (retos or ''))
    b.close()
    print('\n'.join(logs[:15]) or 'consola limpia')
