import { wrapText } from './menu-layout';
import { isMobileDevice } from './mobile-shell';
import * as ex from 'excalibur';
import {
  canvasText,
  panelRect,
  makeFieldCaret,
  GOLD,
  DIM,
  STROKE,
} from './canvas-ui';
import {
  bindCanvasTextField,
  refreshCanvasTextFields,
  type CanvasTextFieldHandle,
} from './html-field';
import { bindButtonPress } from './button-press';
import { buttonCaptionPos } from './button-style';
import { coinSetting } from '../../src/shared/economy';

const openDialogs = new WeakSet<ex.Scene>();
export function coinDialogOpen(scene: ex.Scene): boolean {
  return openDialogs.has(scene);
}

export interface CoinField {
  key: string;
  label: string;
  value: number;
}
export interface CoinDialogOptions {
  choice?: {
    values: string[];
    index: number;
    onChange: (index: number) => void;
  };
  onChange?: (
    key: string,
    values: Readonly<Record<string, string>>,
  ) => Record<string, string>;
  validate?: (values: Record<string, number>) => void;
}
/** Numeric canvas form shared by table creation, buy-ins, and top-ups. */
export function coinDialog(
  engine: ex.Engine,
  scene: ex.Scene,
  title: string,
  note: string,
  fields: readonly CoinField[],
  confirm = 'Confirm',
  options: CoinDialogOptions = {},
): Promise<Record<string, number> | null> {
  return new Promise((resolve) => {
    const mobile = isMobileDevice();
    const panelX = mobile ? 160 : 180;
    const panelWidth = mobile ? 640 : 600;
    const panelHeight =
      (mobile ? 230 : 160) + Math.max(1, fields.length) * (mobile ? 58 : 54);
    const panelY = Math.floor((540 - panelHeight) / 2);
    const left = panelX + 24;
    let open = true;
    openDialogs.add(scene);
    const actors: ex.Actor[] = [];
    const inputs: CanvasTextFieldHandle[] = [];
    const keyedInputs = new Map<string, CanvasTextFieldHandle>();
    const labels = new Map<string, ex.Text>();
    const values = Object.fromEntries(
      fields.map((field) => [field.key, String(field.value)]),
    );
    const add = (actor: ex.Actor): ex.Actor => {
      scene.add(actor);
      actors.push(actor);
      return actor;
    };
    const text = (
      x: number,
      y: number,
      value: string,
      size = 10,
      color = GOLD,
    ): ex.Text => {
      const graphic = canvasText(value, size, color);
      const actor = new ex.Actor({
        pos: ex.vec(x, y),
        anchor: ex.vec(0, 0),
        z: 103,
      });
      actor.graphics.use(graphic);
      add(actor);
      return graphic;
    };
    const shade = new ex.Actor({
      pos: ex.vec(-240, 0),
      width: 1440,
      height: 540,
      anchor: ex.vec(0, 0),
      z: 100,
    });
    shade.graphics.use(
      panelRect(1440, 540, ex.Color.fromRGB(0, 0, 0, 0.7), STROKE),
    );
    shade.on('pointerdown', (event) => event.cancel());
    shade.on('pointerup', (event) => event.cancel());
    add(shade);
    const panel = new ex.Actor({
      pos: ex.vec(panelX, panelY),
      width: panelWidth,
      height: panelHeight,
      anchor: ex.vec(0, 0),
      z: 101,
    });
    panel.graphics.use(
      panelRect(panelWidth, panelHeight, ex.Color.fromHex('#0a2e1c'), STROKE),
    );
    add(panel);
    text(left, panelY + 20, title, mobile ? 16 : 14);
    text(left, panelY + 52, note, mobile ? 10 : 8, DIM);
    if (options.choice) {
      const choice = options.choice;
      let index = choice.index;
      const actor = new ex.Actor({
        pos: ex.vec(panelX + panelWidth - 270, panelY + 14),
        anchor: ex.vec(0, 0),
        width: 246,
        height: 32,
        z: 104,
      });
      actor.graphics.use(
        panelRect(246, 32, ex.Color.fromHex('#1b5c38'), STROKE),
      );
      const size = mobile ? 10 : 8;
      const caption = canvasText('', size, GOLD);
      const captionActor = new ex.Actor({ anchor: ex.vec(0, 0), z: 1 });
      captionActor.graphics.use(caption);
      captionActor.pointer.useGraphicsBounds = false;
      captionActor.pointer.useColliderShape = false;
      actor.addChild(captionActor);
      const paintChoice = (): void => {
        caption.text = `Betting: ${choice.values[index]} ↔`;
        const pos = buttonCaptionPos(caption.text, 246, 32, size);
        captionActor.pos = ex.vec(pos.x, pos.y);
      };
      paintChoice();
      bindButtonPress(actor, undefined, undefined, () => {
        index = (index + 1) % choice.values.length;
        paintChoice();
        choice.onChange(index);
      });
      add(actor);
    }
    const error = text(
      left,
      panelY + panelHeight - (mobile ? 116 : 82),
      '',
      mobile ? 10 : 8,
      ex.Color.fromHex('#e85d4c'),
    );
    const finish = (result: Record<string, number> | null): void => {
      if (!open) return;
      open = false;
      openDialogs.delete(scene);
      for (const input of inputs) input.close();
      for (const actor of actors) actor.kill();
      window.removeEventListener('keydown', key);
      refreshCanvasTextFields();
      resolve(result);
    };
    const submit = (): void => {
      try {
        const result: Record<string, number> = {};
        for (const field of fields)
          result[field.key] = coinSetting(
            Number(values[field.key]),
            field.value,
          );
        options.validate?.(result);
        finish(result);
      } catch (reason) {
        const message =
          reason instanceof Error ? reason.message : 'Invalid chips';
        error.text = wrapText(
          message,
          Math.floor((panelWidth - 48) / (mobile ? 10 : 8)),
        ).join('\n');
      }
    };
    const key = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') finish(null);
    };
    window.addEventListener('keydown', key);
    fields.forEach((field, index) => {
      const y = panelY + (mobile ? 110 : 90) + index * (mobile ? 58 : 54);
      text(left, y + 12, field.label, mobile ? 12 : 10, DIM);
      const box = {
        x: panelX + panelWidth - 270,
        y,
        w: 246,
        h: mobile ? 50 : 38,
      };
      const actor = new ex.Actor({
        pos: ex.vec(box.x, box.y),
        anchor: ex.vec(0, 0),
        width: box.w,
        height: box.h,
        z: 102,
      });
      actor.graphics.use(
        panelRect(box.w, box.h, ex.Color.fromHex('#0b2418'), STROKE),
      );
      add(actor);
      const label = text(box.x + 10, box.y + 12, values[field.key], 12);
      labels.set(field.key, label);
      const caret = makeFieldCaret(12, 104);
      add(caret);
      const paintCaret = (index: number): void => {
        caret.pos = ex.vec(box.x + 10 + index * 12, box.y + 12);
        caret.graphics.opacity = 1;
      };
      const input = bindCanvasTextField({
        id: `coins-${field.key}`,
        label: field.label,
        box,
        maxLength: 10,
        inputMode: 'numeric',
        active: () => open && engine.currentScene === scene,
        read: () => values[field.key],
        sanitize: (value) => value.replace(/\D/g, '').slice(0, 10),
        write: (value) => {
          values[field.key] = value;
          label.text = value || '0';
          error.text = '';
          const updates = options.onChange?.(field.key, values) ?? {};
          for (const [key, next] of Object.entries(updates)) {
            if (!(key in values) || next === values[key]) continue;
            values[key] = next;
            const target = labels.get(key);
            if (target) target.text = next || '0';
            keyedInputs.get(key)?.sync();
          }
        },
        submit,
        cancel: () => finish(null),
        onFocus: () => paintCaret(values[field.key].length),
        onBlur: () => {
          caret.graphics.opacity = 0;
        },
        enterKeyHint: 'done',
        autoCapitalize: 'off',
        metrics: { x: box.x + 10, y: box.y + 12, columns: 18, size: 12 },
        onCaret: paintCaret,
      });
      inputs.push(input);
      keyedInputs.set(field.key, input);
    });
    const button = (x: number, label: string, action: () => void): void => {
      const actor = new ex.Actor({
        pos: ex.vec(x, panelY + panelHeight - (mobile ? 72 : 50)),
        anchor: ex.vec(0, 0),
        width: 260,
        height: mobile ? 56 : 34,
        z: 103,
      });
      actor.graphics.use(
        panelRect(260, mobile ? 56 : 34, ex.Color.fromHex('#1b5c38'), STROKE),
      );
      const place = buttonCaptionPos(
        label,
        260,
        mobile ? 56 : 34,
        mobile ? 12 : 10,
      );
      const caption = new ex.Actor({
        pos: ex.vec(place.x, place.y),
        anchor: ex.vec(0, 0),
      });
      caption.graphics.use(canvasText(label, mobile ? 12 : 10, GOLD));
      actor.addChild(caption);
      bindButtonPress(
        actor,
        () => {},
        () => {},
        action,
      );
      add(actor);
    };
    button(left, confirm, submit);
    button(panelX + panelWidth - 284, 'Cancel', () => finish(null));
    refreshCanvasTextFields();
  });
}
