# Módulo «Calidad del agua»: las tres partes en escritorio y teléfono, con interacción básica.
from playwright.sync_api import sync_playwright
import os
OUT = '/home/claude/shots/calidad'
os.makedirs(OUT, exist_ok=True)
logs = []
with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
    for vw, vh, tag in [(1440, 900, 'pc'), (390, 844, 'tel')]:
        pg = b.new_page(viewport={'width': vw, 'height': vh})
        pg.on('console', lambda m: logs.append(f'{m.type}: {m.text}') if m.type == 'error' else None)
        pg.on('pageerror', lambda e: logs.append(f'pageerror: {e}'))
        pg.goto('http://127.0.0.1:5173/#recorrido'); pg.wait_for_timeout(800)
        pg.evaluate("() => localStorage.clear()"); pg.reload(); pg.wait_for_timeout(800)
        pg.get_by_role('button', name='Calidad del agua').click()
        pg.wait_for_selector('.q-tabs', timeout=30000); pg.wait_for_timeout(800)
        pg.screenshot(path=f'{OUT}/{tag}-1-quebrada.png', full_page=(tag == 'tel'))
        # sonda en B, muestra, piedra
        pg.locator('.q-stations button', has_text='B ·').click(); pg.wait_for_timeout(200)
        pg.get_by_role('button', name='Tomar muestra para el laboratorio').click()
        pg.locator('.q-stations button', has_text='A ·').click(); pg.wait_for_timeout(200)
        pg.get_by_role('button', name='Tomar muestra para el laboratorio').click()
        pg.get_by_role('button', name='Levantar una piedra').click(); pg.wait_for_timeout(300)
        pg.screenshot(path=f'{OUT}/{tag}-2-piedra-arriba.png', full_page=(tag == 'tel'))
        pg.locator('.q-stations button', has_text='B ·').click(); pg.wait_for_timeout(300)
        pg.get_by_role('radio', name='Verano').click(); pg.wait_for_timeout(200)
        pg.locator('.q-box h3', has_text='Debajo de la piedra').scroll_into_view_if_needed(); pg.wait_for_timeout(200)
        pg.screenshot(path=f'{OUT}/{tag}-3-piedra-abajo.png', full_page=(tag == 'tel'))
        print(tag, 'BMWP B verano', pg.locator('.q-bmwp').inner_text().replace('\n', ' '))
        pg.get_by_role('radio', name='Alcantarillado').click(); pg.wait_for_timeout(200)
        print(tag, 'BMWP B alcantarillado', pg.locator('.q-bmwp').inner_text().replace('\n', ' '))
        # parte 2
        pg.get_by_role('tab', name='Del río a la llave').click(); pg.wait_for_timeout(500)
        pg.screenshot(path=f'{OUT}/{tag}-4-llave-inicio.png', full_page=(tag == 'tel'))
        pg.get_by_role('button', name='Hacer la prueba de jarras').click(); pg.wait_for_timeout(1500)
        best = pg.locator('.q-jars li.is-best button').first
        best.click(); pg.wait_for_timeout(200)
        pg.locator('.q-range input').nth(1).fill('1.5'); pg.wait_for_timeout(300)
        pg.screenshot(path=f'{OUT}/{tag}-5-llave-cumple.png', full_page=(tag == 'tel'))
        print(tag, 'llave', pg.locator('.q-irca p').inner_text(), '|', pg.locator('.q-part .q-verdict').last.inner_text()[:90])
        # parte 3
        pg.get_by_role('tab', name='La ciudad y la lluvia').click(); pg.wait_for_timeout(500)
        pg.get_by_role('button', name='Que llueva').click(); pg.wait_for_timeout(3000)
        pg.screenshot(path=f'{OUT}/{tag}-6-ciudad-lloviendo.png', full_page=(tag == 'tel'))
        pg.wait_for_timeout(3500)
        pg.screenshot(path=f'{OUT}/{tag}-7-ciudad-final.png', full_page=(tag == 'tel'))
        # enlace al laboratorio de lluvia
        if tag == 'pc':
            pg.get_by_role('button', name='Misión: conexiones erradas').click()
            pg.wait_for_selector('.city-simbar', timeout=60000); pg.wait_for_timeout(2500)
            pg.screenshot(path=f'{OUT}/{tag}-8-mision.png')
            print(tag, 'misión', pg.locator('.city-panel h2, .city-panel h3').first.inner_text()[:80])
        pg.close()
    b.close()
print('\n'.join(logs[:20]) or 'consola limpia')
