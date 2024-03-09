import * as PIXI from "pixi.js";
import { useEffect, useRef } from "react";
import * as sss from "sounds-some-sounds";
import {
  arrangeHorizontal,
  asContainer,
  centerize,
  position,
  positionInterpolated,
} from "../utils/container";
import { createGraphics } from "../utils/graphics";
import { normalize, scale } from "../utils/vector";

interface Entity {
  graphics: PIXI.Graphics;
  position: {
    left?: number;
    right?: number;
    top?: number;
    bottom?: number;
    centerX?: boolean;
    centerY?: boolean;
  };
  state: {
    type: "none" | "waiting" | "appeal" | "done";
    exists: boolean;
    t: number;
  };
  effects: {
    appeal?: {
      type: "move";
      from: {
        left?: number;
        right?: number;
        top?: number;
        bottom?: number;
        centerX?: boolean;
        centerY?: boolean;
      };
      start?: () => boolean;
    };
  };
  plugins: ((entity: Entity) => void)[];
}

const pluginMoveByArrowKeys =
  (options: {
    speed: number;
    clampedBy?: {
      width: number;
      height: number;
    };
    condition?: (entity: Entity) => boolean;
  }) =>
  (entity: Entity) => {
    if (options.condition && !options.condition(entity)) {
      return;
    }

    if (keys.ArrowLeft) {
      entity.graphics.x -= options.speed;
    }
    if (keys.ArrowRight) {
      entity.graphics.x += options.speed;
    }
    if (keys.ArrowUp) {
      entity.graphics.y -= options.speed;
    }
    if (keys.ArrowDown) {
      entity.graphics.y += options.speed;
    }

    if (options.clampedBy) {
      entity.graphics.x = Math.max(
        0,
        Math.min(
          options.clampedBy.width - entity.graphics.width,
          entity.graphics.x,
        ),
      );
      entity.graphics.y = Math.max(
        0,
        Math.min(
          options.clampedBy.height - entity.graphics.height,
          entity.graphics.y,
        ),
      );
    }
  };

const keys: { [key: string]: boolean } = {};
const keysPressing: { [key: string]: number } = {};

const main = () => {
  const canvasSize = { width: 500, height: 500 };
  const app = new PIXI.Application({
    width: canvasSize.width,
    height: canvasSize.height,
  });
  app.stage.eventMode = "static";
  app.stage.hitArea = app.screen;

  let mode: "start" | "play" | "gameover" = "start";

  let elapsed = 0.0;

  const gameStartLayer = asContainer(
    new PIXI.Text("Bullets", {
      fontFamily: "serif",
      fontSize: 64,
      fill: 0xffffff,
      stroke: 0x0044ff,
    }),
    new PIXI.Text("← STAGE 1 →", {
      fontFamily: "serif",
      fontSize: 24,
      fill: 0xffffff,
      stroke: 0x0044ff,
    }),
    new PIXI.Text("Press SPACE to Start", {
      fontFamily: "serif",
      fontSize: 28,
      fill: 0xffffff,
      stroke: 0x0044ff,
    }),
  );
  app.stage.addChild(gameStartLayer);

  arrangeHorizontal(gameStartLayer, { gap: 8, align: "center" });
  centerize(gameStartLayer, canvasSize);

  const gameOverLayer = asContainer(
    new PIXI.Text("GAME OVER", {
      fontFamily: "serif",
      fontSize: 64,
      fill: 0xffffff,
      stroke: 0x0044ff,
    }),
    new PIXI.Text("PRESS ENTER TO RESTART", {
      fontFamily: "serif",
      fontSize: 24,
      fill: 0xffffff,
      stroke: 0x0044ff,
    }),
  );
  arrangeHorizontal(gameOverLayer, { gap: 8, align: "center" });
  centerize(gameOverLayer, canvasSize);

  let stage = 0;

  const stages = [{}, {}, {}, {}, {}, {}];

  const character = createGraphics(["l"], undefined, 20);
  const enemy = createGraphics(["l"], 0xff0000);
  const bullet = createGraphics(
    [" lll ", "lllll", "lllll", " lll "],
    0xffffff,
    8,
  );

  const entities: Entity[] = [
    {
      graphics: character,
      position: {
        bottom: 20,
        centerX: true,
      },
      effects: {
        appeal: {
          type: "move",
          from: {
            bottom: -20,
            centerX: true,
          },
          start: () => mode === "play",
        },
      },
      state: {
        exists: false,
        type: "none",
        t: 0,
      },
      plugins: [
        pluginMoveByArrowKeys({
          speed: 3,
          clampedBy: canvasSize,
          condition: (entity) =>
            mode === "play" && entity.state.type === "done",
        }),
      ],
    },
    {
      graphics: enemy,
      position: {
        top: 20,
        centerX: true,
      },
      effects: {
        appeal: {
          type: "move",
          from: {
            top: -40,
            centerX: true,
          },
          start: () => mode === "play",
        },
      },
      state: {
        exists: false,
        type: "none" as const,
        t: 0,
      },
      plugins: [],
    },
  ];
  const render = () => {
    for (const l of entities) {
      if (!l.state.exists) {
        position(l.graphics, canvasSize, l.position);
        l.state.exists = true;
        app.stage.addChild(l.graphics);

        if (l.effects.appeal) {
          if (l.effects.appeal.type === "move") {
            position(l.graphics, canvasSize, l.effects.appeal.from);
            l.state.type = "waiting";
          }
        }
      }

      if (l.state.type === "waiting") {
        if (l.effects.appeal?.start?.()) {
          l.state.type = "appeal";
          l.state.t = 0;
        }
      }

      if (l.state.type === "appeal" && l.effects.appeal) {
        l.state.t += 1 / 30;
        positionInterpolated(
          l.graphics,
          l.state.t,
          {
            containerSize: canvasSize,
            layout: l.effects.appeal.from,
          },
          {
            containerSize: canvasSize,
            layout: l.position,
          },
        );

        if (l.state.t >= 1) {
          l.state.type = "done";
        }
      }

      for (const p of l.plugins) {
        p(l);
      }
    }
  };
  render();

  let frames = 0;

  let bullets: { graphics: PIXI.Graphics; velocity: PIXI.Point }[] = [];
  const updateBullets = () => {
    for (const b of bullets) {
      b.graphics.x += b.velocity.x;
      b.graphics.y += b.velocity.y;

      if (!app.screen.contains(b.graphics.x, b.graphics.y)) {
        app.stage.removeChild(b.graphics);
      }
    }
  };

  const initPlay = () => {
    mode = "play";

    frames = 0;

    app.stage.removeChild(gameStartLayer);

    sss.playBgm(`BULLETS ${stage + 1}`);
  };

  app.ticker.add((delta) => {
    sss.update();
    elapsed += delta;
    if (entities[0].state.type === "done") {
      frames += 1;
    }

    for (const key in keys) {
      keysPressing[key] = keys[key] ? (keysPressing[key] ?? 0) + 1 : 0;
    }

    render();

    if (mode === "start") {
      if (keysPressing.ArrowLeft === 1) {
        stage = (stage - 1 + stages.length) % stages.length;
        (gameStartLayer.children[1] as PIXI.Text).text = `← STAGE ${
          stage + 1
        } →`;
      } else if (keysPressing.ArrowRight === 1) {
        stage = (stage + 1) % stages.length;
        (gameStartLayer.children[1] as PIXI.Text).text = `← STAGE ${
          stage + 1
        } →`;
      }
      if (keys[" "]) {
        initPlay();
      }
    } else if (mode === "play") {
      if (0 < frames && frames < 800 && frames % 20 === 0) {
        for (let i = 0; i < 360; i += 360 / 20) {
          const b = bullet.clone();
          b.x = enemy.x + enemy.width / 2 - b.width / 2;
          b.y = enemy.y + enemy.height / 2 - b.height / 2;

          const angle = Math.atan2(character.y - b.y, character.x - b.x);

          bullets.push({
            graphics: b,
            velocity: scale(
              normalize(
                new PIXI.Point(
                  Math.cos(angle + (i * Math.PI) / 180),
                  Math.sin(angle + (i * Math.PI) / 180),
                ),
              ),
              4.5,
            ),
          });
          app.stage.addChild(b);
        }
      } else if (1000 < frames && frames < 1800 && frames % 20 === 0) {
        for (let i = 0; i < 360; i += 360 / 10) {
          const b = bullet.clone();
          b.x = enemy.x + enemy.width / 2 - b.width / 2;
          b.y = enemy.y + enemy.height / 2 - b.height / 2;

          const angle = Math.atan2(character.y - b.y, character.x - b.x);

          bullets.push({
            graphics: b,
            velocity: scale(
              normalize(
                new PIXI.Point(
                  Math.cos(angle + (i * Math.PI) / 180),
                  Math.sin(angle + (i * Math.PI) / 180),
                ),
              ),
              4.5,
            ),
          });
          app.stage.addChild(b);
        }
      } else if (2000 < frames && frames < 2800 && frames % 10 === 0) {
        for (let i = 0; i < 360; i += 360 / 5) {
          const b = bullet.clone();
          b.x = enemy.x + enemy.width / 2 - b.width / 2;
          b.y = enemy.y + enemy.height / 2 - b.height / 2;

          const angle = Math.atan2(character.y - b.y, character.x - b.x);

          bullets.push({
            graphics: b,
            velocity: scale(
              normalize(
                new PIXI.Point(
                  Math.cos(angle + (i * Math.PI) / 180),
                  Math.sin(angle + (i * Math.PI) / 180),
                ),
              ),
              4.5,
            ),
          });
          app.stage.addChild(b);
        }
      }

      updateBullets();

      for (const b of bullets) {
        if (
          (character.x - b.graphics.x) ** 2 +
            (character.y - b.graphics.y) ** 2 <
          (10 + 4) ** 2
        ) {
          mode = "gameover";
          sss.stopBgm();
          sss.playSoundEffect("explosion");

          app.stage.addChild(gameOverLayer);
        }
      }
    } else if (mode === "gameover") {
      if (keys.Enter) {
        mode = "start";

        app.stage.removeChild(gameOverLayer);

        character.x = 250 - character.width / 2;
        for (const b of bullets) {
          app.stage.removeChild(b.graphics);
        }
        bullets = [];

        app.stage.addChild(gameStartLayer);
      }
    }
  });

  return app;
};

export default function Page() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    sss.init();
    sss.setVolume(0.05);

    const app = main();
    ref.current?.replaceChildren(app.view as unknown as Node);

    const keydownhandler = (e: KeyboardEvent) => {
      e.preventDefault();
      keys[e.key] = true;
    };
    const keyuphandler = (e: KeyboardEvent) => {
      e.preventDefault();
      keys[e.key] = false;
    };

    window.addEventListener("keydown", keydownhandler);
    window.addEventListener("keyup", keyuphandler);

    return () => {
      app.destroy();
      window.removeEventListener("keydown", keydownhandler);
      window.removeEventListener("keyup", keyuphandler);
    };
  }, []);

  return <div ref={ref} />;
}
