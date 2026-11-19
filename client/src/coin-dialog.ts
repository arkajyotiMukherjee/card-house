import { isMobileDevice } from './mobile-shell';
import * as ex from 'excalibur';
import {
  panelRect,
  makeFieldCaret,
  showFieldCaret,
  GOLD,
  DIM,
  STROKE,
} from './canvas-ui';
import {
  bindCanvasTextField,
  layoutFieldCaret,
  refreshCanvasTextFields,
  type CanvasTextFieldHandle,
} from './html-field';
import { bindButtonPress } from './button-press';
import { classicText } from './classic-table-design';
import { uiCaption, uiFieldLabel, uiSingleLine, uiText } from './ui-text';
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
  playerName?: string;
  focusFirst?: boolean;
  onSubmit?: (values: Record<string, number>) => Promise<string | undefined>;
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
    const panelWidth = mobile ? 688 : 600;
    const panelX = (960 - panelWidth) / 2;
    const padding = mobile ? 32 : 24;
    const contentWidth = panelWidth - 2 * padding;
    const nameHeight = options.playerName ? (mobile ? 34 : 28) : 0;
    const panelHeight =
      (mobile ? 230 : 160) +
      Math.max(1, fields.length) * (mobile ? 58 : 54) +
      nameHeight;
    const panelY = Math.floor((540 - panelHeight) / 2);
    const left = panelX + padding;
    const right = left + contentWidth;
    let open = true;
    let submitting = false;
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
    const addText = (x: number, y: number, graphic: ex.Text): ex.Text => {
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
    addText(left, panelY + 18, classicText(title, 24, GOLD));
    if (options.playerName) {
      addText(
        left,
        panelY + 48,
        uiSingleLine(
          `Playing as ${options.playerName}`,
          mobile ? 24 : 19,
          GOLD,
          contentWidth,
        ),
      );
    }
    const description = uiText(note, mobile ? 21 : 16, DIM);
    description.maxWidth = contentWidth;
    addText(left, panelY + 52 + nameHeight, description);
    if (options.choice) {
      const choice = options.choice;
      let index = choice.index;
      const choiceWidth = 246;
      const choiceHeight = 38;
      const actor = new ex.Actor({
        pos: ex.vec(right - choiceWidth, panelY + 12),
        anchor: ex.vec(0, 0),
        width: choiceWidth,
        height: choiceHeight,
        z: 104,
      });
      actor.graphics.use(
        panelRect(
          choiceWidth,
          choiceHeight,
          ex.Color.fromHex('#1b5c38'),
          STROKE,
        ),
      );
      const size = mobile ? 21 : 17;
      const caption = uiText('', size, GOLD);
      const captionActor = new ex.Actor({ anchor: ex.vec(0, 0), z: 1 });
      captionActor.graphics.use(caption);
      captionActor.pointer.useGraphicsBounds = false;
      captionActor.pointer.useColliderShape = false;
      actor.addChild(captionActor);
      const paintChoice = (): void => {
        caption.text = `Betting: ${choice.values[index]} ↔`;
        const pos = uiCaption(caption.text, choiceWidth, choiceHeight, size);
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
    const error = uiText('', mobile ? 19 : 15, ex.Color.fromHex('#e85d4c'));
    error.maxWidth = contentWidth;
    addText(left, panelY + panelHeight - (mobile ? 116 : 82), error);
    const finish = (result: Record<string, number> | null): void => {
      if (!open) return;
      open = false;
      openDialogs.delete(scene);
      for (const input of inputs) input.close();
      for (const actor of actors) actor.kill();
      window.removeEventListener('keydown', key);
      scene.off('deactivate', deactivate);
      refreshCanvasTextFields();
      resolve(result);
    };
    const submit = async (): Promise<void> => {
      if (submitting) return;
      try {
        const result: Record<string, number> = {};
        for (const field of fields)
          result[field.key] = coinSetting(
            Number(values[field.key]),
            field.value,
          );
        options.validate?.(result);
        if (options.onSubmit) {
          submitting = true;
          error.text = '';
          refreshCanvasTextFields();
          const failure = await options.onSubmit(result);
          if (failure) throw new Error(failure);
        }
        finish(result);
      } catch (reason) {
        const message =
          reason instanceof Error ? reason.message : 'Invalid chips';
        error.text = message;
      } finally {
        if (open && submitting) {
          submitting = false;
          refreshCanvasTextFields();
        }
      }
    };
    const cancel = (): void => {
      if (!submitting) finish(null);
    };
    const deactivate = (): void => finish(null);
    const key = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') cancel();
    };
    window.addEventListener('keydown', key);
    scene.on('deactivate', deactivate);
    fields.forEach((field, index) => {
      const y =
        panelY + (mobile ? 110 : 90) + nameHeight + index * (mobile ? 58 : 54);
      const inputWidth = mobile ? 272 : 246;
      const box = {
        x: right - inputWidth,
        y,
        w: inputWidth,
        h: mobile ? 54 : 38,
      };
      const labelSize = mobile ? 22 : 17;
      addText(
        left,
        y + Math.round((box.h - labelSize) / 2),
        uiText(field.label, labelSize, GOLD),
      );
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
      const metrics = uiFieldLabel(box, mobile ? 25 : 20, 16);
      const label = addText(
        metrics.x,
        metrics.y,
        uiText(values[field.key], metrics.size, GOLD),
      );
      labels.set(field.key, label);
      const caret = makeFieldCaret(metrics.size, 104);
      add(caret);
      const paintCaret = (index: number): void => {
        const layout = layoutFieldCaret({
          value: values[field.key],
          index,
          size: metrics.size,
          originX: metrics.x,
          originY: metrics.y,
          measure: metrics.measure,
        });
        showFieldCaret(caret, true, layout.x, layout.y);
      };
      const input = bindCanvasTextField({
        id: `coins-${field.key}`,
        label: field.label,
        box,
        maxLength: 10,
        inputMode: 'numeric',
        active: () => open && !submitting && engine.currentScene === scene,
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
        submit: () => void submit(),
        cancel,
        onFocus: () => paintCaret(values[field.key].length),
        onBlur: () => {
          caret.graphics.opacity = 0;
        },
        enterKeyHint: 'done',
        autoCapitalize: 'off',
        metrics,
        onCaret: paintCaret,
      });
      inputs.push(input);
      keyedInputs.set(field.key, input);
    });
    const buttonWidth = (contentWidth - 32) / 2;
    const buttonHeight = mobile ? 56 : 34;
    const buttonSize = mobile ? 24 : 18;
    const button = (x: number, label: string, action: () => void): void => {
      const actor = new ex.Actor({
        pos: ex.vec(x, panelY + panelHeight - (mobile ? 72 : 50)),
        anchor: ex.vec(0, 0),
        width: buttonWidth,
        height: buttonHeight,
        z: 103,
      });
      actor.graphics.use(
        panelRect(
          buttonWidth,
          buttonHeight,
          ex.Color.fromHex('#1b5c38'),
          STROKE,
        ),
      );
      const place = uiCaption(label, buttonWidth, buttonHeight, buttonSize);
      const caption = new ex.Actor({
        pos: ex.vec(place.x, place.y),
        anchor: ex.vec(0, 0),
      });
      caption.graphics.use(uiText(label, buttonSize, GOLD));
      actor.addChild(caption);
      bindButtonPress(
        actor,
        () => {},
        () => {},
        action,
      );
      add(actor);
    };
    button(left, 'Cancel', cancel);
    button(right - buttonWidth, confirm, () => void submit());
    refreshCanvasTextFields();
    if (options.focusFirst) inputs[0]?.focus();
  });
}
