// Etiquetas HTML sobre la escena 3D, con prioridad y sin superposición.
// Son un complemento visual (aria-hidden): el panel ofrece la lista equivalente accesible.

export interface LabelItem {
  id: string;
  text: string;
  priority: number;
  kind?: 'lugar' | 'sonda' | 'aviso' | 'sector' | 'gotas' | 'lejano';
  /** Color de la marca circular (etiquetas de gotas trazadoras). */
  color?: string;
  /** Texto secundario (p. ej., profundidad en una sonda). */
  sub?: string;
}

interface Placed {
  el: HTMLDivElement;
  sub: HTMLSpanElement;
  w: number;
  h: number;
  item: LabelItem;
}

export class LabelLayer {
  readonly root: HTMLDivElement;
  private map = new Map<string, Placed>();

  constructor(parent: HTMLElement) {
    this.root = document.createElement('div');
    this.root.className = 'city-labels';
    this.root.setAttribute('aria-hidden', 'true');
    parent.appendChild(this.root);
  }

  set(items: LabelItem[]): void {
    const keep = new Set(items.map((i) => i.id));
    for (const [id, p] of this.map) if (!keep.has(id)) {
      p.el.remove();
      this.map.delete(id);
    }
    for (const it of items) {
      let p = this.map.get(it.id);
      if (!p) {
        const el = document.createElement('div');
        el.className = `city-label kind-${it.kind ?? 'lugar'}`;
        const t = document.createElement('span');
        t.className = 'city-label-text';
        const sub = document.createElement('span');
        sub.className = 'city-label-sub';
        el.append(t, sub);
        this.root.appendChild(el);
        p = { el, sub, w: 0, h: 0, item: it };
        this.map.set(it.id, p);
      }
      if (it.color) p.el.style.setProperty('--dot', it.color);
      const t = p.el.firstChild as HTMLSpanElement;
      if (t.textContent !== it.text) {
        t.textContent = it.text;
        p.w = 0;
      }
      const s = it.sub ?? '';
      if (p.sub.textContent !== s) {
        p.sub.textContent = s;
        p.w = 0;
      }
      p.item = it;
    }
  }

  setSub(id: string, sub: string): void {
    const p = this.map.get(id);
    if (p && p.sub.textContent !== sub) {
      p.sub.textContent = sub;
      p.item.sub = sub;
    }
  }

  /** Coloca las etiquetas en las posiciones de pantalla dadas evitando superposiciones. */
  layout(pos: Map<string, { x: number; y: number; visible: boolean }>, width: number, height: number, reserved: DOMRect[] = []): void {
    const boxes: [number, number, number, number][] = reserved.map((r) => [r.left, r.top, r.right, r.bottom]);
    const list = [...this.map.values()].sort((a, b) => b.item.priority - a.item.priority);
    for (const p of list) {
      const q = pos.get(p.item.id);
      if (!q || !q.visible) {
        p.el.style.visibility = 'hidden';
        continue;
      }
      if (!p.w) {
        p.el.style.visibility = 'hidden';
        p.el.style.transform = 'translate(-9999px,0)';
        p.w = p.el.offsetWidth;
        p.h = p.el.offsetHeight;
      }
      // las etiquetas de sector (las que se pueden elegir) prueban otras posiciones antes de ocultarse
      const tries: [number, number][] = p.item.kind === 'sector'
        ? [[0, 0], [0, -(p.h + 6)], [p.w * 0.55, 0], [-p.w * 0.55, 0], [0, p.h + 22]]
        : [[0, 0]];
      let placed: [number, number, [number, number, number, number]] | null = null;
      for (const [dx, dy] of tries) {
        const x0 = q.x - p.w / 2 + dx, y0 = q.y - p.h - 8 + dy;
        const box: [number, number, number, number] = [x0 - 3, y0 - 3, x0 + p.w + 3, y0 + p.h + 3];
        const out = box[0] < 0 || box[1] < 0 || box[2] > width || box[3] > height;
        const hit = boxes.some((b) => !(box[2] < b[0] || box[0] > b[2] || box[3] < b[1] || box[1] > b[3]));
        if (!out && !hit) {
          placed = [x0, y0, box];
          break;
        }
      }
      if (!placed) {
        p.el.style.visibility = 'hidden';
        continue;
      }
      boxes.push(placed[2]);
      p.el.style.visibility = 'visible';
      p.el.style.transform = `translate(${Math.round(placed[0])}px, ${Math.round(placed[1])}px)`;
    }
  }

  dispose(): void {
    this.root.remove();
    this.map.clear();
  }
}
