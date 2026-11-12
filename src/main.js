import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { DCMotorModel } from './motor.js';

/**
 * 主控制器：管理 3D 场景、8 幕渐进式教学演化流程、交互控制与 HUD 状态
 */
class MotorLectureApp {
  constructor() {
    this.container = document.getElementById('presentation-container');
    this.viewport = document.getElementById('webgl-viewport');

    // 8 幕渐进式教学剧本体系
    this.acts = [
      {
        num: 1,
        title: "第 1 幕：静止磁场环境构建",
        desc: "左侧红色 N 极与右侧蓝色 S 极永磁体在空气隙中激发出水平方向由 N 极指向 S 极的均匀磁感应线。磁场方向统一向右。",
        formula: "B = 常量 (均匀水平磁场)",
        camera: { x: 6.8, y: 4.8, z: 7.8, target: [0, 0, 0] },
      },
      {
        num: 2,
        title: "第 2 幕：通电矩形线框在磁场中受力 (安培力与电磁转矩)",
        desc: "参考经典物理教学实验：前方配备高拟真 J1202A 型学生电源，长跨距红绿导线从接线柱香蕉插头引出连接至线框两端鳄鱼夹。通电后，线框左右两侧受到大小相等、方向相反的安培力（左侧向上、右侧向下），形成电磁转矩驱动线框旋转。由于转动力矩随转角呈 cosθ 衰减，在垂直平面 (90°) 时力矩降为零，线框在阻尼作用下刚好旋转 90 度并稳定停在垂直平衡位置！",
        formula: "F = I(L × B), M(θ) = M₀ cosθ ⟹ 在 θ=90° (垂直平面) 力矩归零并停稳",
        camera: { x: 7.2, y: 5.6, z: 9.2, target: [-0.9, 0, 1.8] },
      },
      {
        num: 3,
        title: "第 3 幕：演变成矩形闭合线圈与电磁力矩",
        desc: "直导线逐渐弯折 ➔ 形成 U 形 ➔ 闭合为矩形线圈并穿入主转轴。两侧有效边受到方向相反的安培力，形成电磁力偶矩 M = B I S sinα 驱动线圈开始旋转！",
        formula: "M = B I S sinα (顺时针加速力矩)",
        camera: { x: 7.2, y: 5.5, z: 8.5, target: [0, 0, 0] },
      },
      {
        num: 4,
        title: "第 4 幕：线圈为何无法持续转动？(阻尼停转现象)",
        desc: "若无换向器，导线电流不反转。转过平衡位置后安培力转为阻碍转动的反向力矩！在阻尼摩擦下，线圈最终稳定停在垂直平衡位置。",
        formula: "M(θ) = -M₀ cosθ, 最终静止于 θ=90°",
        camera: { x: 5.8, y: 3.6, z: 7.5, target: [0, 0, 0] },
      },
      {
        num: 5,
        title: "第 5 幕：破局之匙——引入双半环换向器与固定电刷",
        desc: "观察换向器真实机械结构：两个相互绝缘的半圆铜环，存在明显绝缘缝隙；两铜环分别焊接线圈两端；两个固定石墨电刷分别与铜环左右滑动接触。",
        formula: "双半环换向器 + 固定石墨电刷",
        camera: { x: 3.2, y: 1.8, z: 4.2, target: [0, 0, 2.65] },
      },
      {
        num: 6,
        title: "第 6 幕：换向核心微观过程剖析 (慢速运转)",
        desc: "慢速演示：换向器旋转半周 ➔ 绝缘缝隙扫过电刷瞬态切断电流 ➔ 越过中性面后电刷接触关系交换 ➔ 线圈电流反向 ➔ 安培力反向 ➔ 转动力矩维持顺时针同向！",
        formula: "越过平衡面: I反向 ⟹ F反向 ⟹ M恒顺时针",
        camera: { x: 2.6, y: 1.6, z: 3.8, target: [0, 0, 2.65] },
      },
      {
        num: 7,
        title: "第 7 幕：直流有刷电动机完整总装与持续运转",
        desc: "全套零部件总装运行。电动机进入平稳连续高速旋转。可实时调节转速、暂停、步进观察转角、电流与安培力的协同变化。",
        formula: "P_out = M · ω, U = E_反 + I R_a",
        camera: { x: 7.2, y: 5.5, z: 8.5, target: [0, 0, 0] },
      },
      {
        num: 8,
        title: "第 8 幕：交互探究——零件独立显隐与整体爆炸拆解",
        desc: "自由探索阶段。支持 360° 全方位观察、透明外壳透视、各零件独立隐藏或一键爆炸拆解，深入剖析内部空间机械配合。",
        formula: "自由实验与拆解探究模式",
        camera: { x: 8.5, y: 6.2, z: 9.5, target: [0, 0, 0] },
      },
    ];

    this.currentActIndex = 0;

    // 初始化场景与系统
    this.initThree();
    this.initMotor();
    this.initUI();
    this.initEvents();

    // 默认进入第 1 幕
    this.goToAct(0);

    // 启动主渲染循环
    this.clock = new THREE.Clock();
    this.animate = this.animate.bind(this);
    requestAnimationFrame(this.animate);
  }

  initThree() {
    const width = this.viewport.clientWidth || window.innerWidth;
    const height = this.viewport.clientHeight || window.innerHeight;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x060913);
    this.scene.fog = new THREE.FogExp2(0x060913, 0.022);

    this.camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
    this.camera.position.set(6.8, 4.8, 7.8);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.2;
    this.viewport.appendChild(this.renderer.domElement);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.06;
    this.controls.maxDistance = 25;
    this.controls.minDistance = 1.8;
    this.controls.target.set(0, 0, 0);

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.9);
    this.scene.add(ambientLight);

    const mainLight = new THREE.DirectionalLight(0xfffaf0, 2.4);
    mainLight.position.set(7, 12, 8);
    mainLight.castShadow = true;
    mainLight.shadow.mapSize.width = 2048;
    mainLight.shadow.mapSize.height = 2048;
    mainLight.shadow.camera.near = 1;
    mainLight.shadow.camera.far = 30;
    mainLight.shadow.camera.left = -9;
    mainLight.shadow.camera.right = 9;
    mainLight.shadow.camera.top = 9;
    mainLight.shadow.camera.bottom = -9;
    mainLight.shadow.bias = -0.0004;
    this.scene.add(mainLight);

    const rimLight = new THREE.DirectionalLight(0x00f0ff, 1.8);
    rimLight.position.set(-8, 6, -7);
    this.scene.add(rimLight);

    const bounceLight = new THREE.DirectionalLight(0xf97316, 0.35);
    bounceLight.position.set(0, -6, 0);
    this.scene.add(bounceLight);

    const gridHelper = new THREE.GridHelper(22, 22, 0x1e293b, 0x0f172a);
    gridHelper.position.y = -2.35;
    this.scene.add(gridHelper);
  }

  initMotor() {
    this.motor = new DCMotorModel();
    this.scene.add(this.motor.root);
  }

  initUI() {
    this.timelineSteps = document.querySelectorAll('.act-timeline .act-step');
    this.btnPrevAct = document.getElementById('btn-prev-act');
    this.btnNextAct = document.getElementById('btn-next-act');
    this.btnActPlayPause = document.getElementById('btn-act-playpause');
    this.actPlayIcon = document.getElementById('act-play-icon');
    this.btnActRestart = document.getElementById('btn-act-restart');
    this.customActionSlot = document.getElementById('act-custom-action-slot');

    this.actNumberTag = document.getElementById('act-number-tag');
    this.actTitleText = document.getElementById('act-title-text');
    this.actDescText = document.getElementById('act-desc-text');
    this.act4NoteBanner = document.getElementById('act4-physics-note');

    this.metricAngle = document.getElementById('metric-angle');
    this.metricBrushState = document.getElementById('metric-brush-state');
    this.metricFormula = document.getElementById('metric-formula');

    this.btnFullscreen = document.getElementById('btn-fullscreen');
    this.btnViewIso = document.getElementById('btn-view-iso');
    this.btnViewFront = document.getElementById('btn-view-front');
    this.btnViewTop = document.getElementById('btn-view-top');
    this.btnViewBrush = document.getElementById('btn-view-brush');
    this.btnResetCam = document.getElementById('btn-reset-cam');
    this.btnToggleLabels = document.getElementById('btn-toggle-labels');

    this.btnToggleSpin = document.getElementById('btn-toggle-spin');
    this.spinIcon = document.getElementById('spin-icon');
    this.spinText = document.getElementById('spin-text');
    this.btnStepSpin = document.getElementById('btn-step-spin');
    this.sliderSpeed = document.getElementById('slider-speed');
    this.valSpeed = document.getElementById('val-speed');
    this.sliderAngle = document.getElementById('slider-angle');
    this.valManualAngle = document.getElementById('val-manual-angle');

    this.modeButtons = {
      normal: document.getElementById('mode-normal'),
      xray: document.getElementById('mode-xray'),
      highlight: document.getElementById('mode-highlight'),
      coil_only: document.getElementById('mode-coil'),
      commutator_only: document.getElementById('mode-commutator'),
      exploded: document.getElementById('mode-exploded'),
    };

    this.vectorToggles = {
      bField: document.getElementById('toggle-layer-bfield'),
      current: document.getElementById('toggle-layer-current'),
      forces: document.getElementById('toggle-layer-forces'),
      rotationArc: document.getElementById('toggle-layer-rotarc'),
    };

    this.partToggles = {
      magnets: document.getElementById('toggle-part-magnets'),
      coil: document.getElementById('toggle-part-coil'),
      shaft: document.getElementById('toggle-part-shaft'),
      commutator: document.getElementById('toggle-part-commutator'),
      brushes: document.getElementById('toggle-part-brushes'),
      power: document.getElementById('toggle-part-power'),
      base: document.getElementById('toggle-part-base'),
    };

    this.sidePanel = document.getElementById('side-panel');
    this.btnToggleDrawer = document.getElementById('btn-toggle-drawer');

    // 场景2专属：左侧显眼电源与电动机装配控制卡片控件
    this.act2PowerPanel = document.getElementById('act2-power-control-panel');
    this.act2PowerDot = document.getElementById('act2-power-dot');
    this.btnAct2MainPower = document.getElementById('btn-act2-main-power');
    this.act2SwitchMainText = document.getElementById('act2-switch-main-text');
    this.act2SwitchSubText = document.getElementById('act2-switch-sub-text');
    this.btnAct2ToggleCurrent = document.getElementById('btn-act2-toggle-current');
    this.act2CurrentDirText = document.getElementById('act2-current-dir-text');

    // 场景2：装配按钮与状态指示
    this.btnAct2ToggleCommutator = document.getElementById('btn-act2-toggle-commutator');
    this.act2BtnCommutatorText = document.getElementById('act2-btn-commutator-text');
    this.btnAct2ToggleBrushes = document.getElementById('btn-act2-toggle-brushes');
    this.act2BtnBrushesText = document.getElementById('act2-btn-brushes-text');
    this.act2AssemblyBadge = document.getElementById('act2-assembly-badge');
    this.act2AssemblyBadgeText = document.getElementById('act2-assembly-badge-text');

    // 场景2：参数滑块
    this.act2SliderCurrent = document.getElementById('act2-slider-current');
    this.act2ValCurrent = document.getElementById('act2-val-current');
    this.act2SliderField = document.getElementById('act2-slider-field');
    this.act2ValField = document.getElementById('act2-val-field');

    // 场景2：持续旋转调控
    this.act2ContinuousControls = document.getElementById('act2-continuous-controls');
    this.act2SliderSpeed = document.getElementById('act2-slider-speed');
    this.act2ValSpeed = document.getElementById('act2-val-speed');
    this.btnAct2PauseSpin = document.getElementById('btn-act2-pause-spin');
    this.act2PauseIcon = document.getElementById('act2-pause-icon');
    this.act2PauseText = document.getElementById('act2-pause-text');
    this.btnAct2StepSpin = document.getElementById('btn-act2-step-spin');
    this.act2HintText = document.getElementById('act2-hint-text');

    // 场景2：线圈与换向片组数升级控件
    this.btnCoilMode1 = document.getElementById('btn-coil-mode-1');
    this.btnCoilMode2 = document.getElementById('btn-coil-mode-2');
    this.btnCoilMode3 = document.getElementById('btn-coil-mode-3');
    this.btnToggleCore = document.getElementById('btn-toggle-core');
    this.act2BtnCoreText = document.getElementById('act2-btn-core-text');
    this.act2ActiveCoilIndicator = document.getElementById('act2-active-coil-indicator');
    this.act2ActiveCoilText = document.getElementById('act2-active-coil-text');
    this.act2CoilRippleText = document.getElementById('act2-coil-ripple-text');
  }

  initEvents() {
    window.addEventListener('resize', () => this.onWindowResize());

    // 场景2专属左侧显眼开关按钮事件绑定
    if (this.btnAct2MainPower) {
      this.btnAct2MainPower.addEventListener('click', () => {
        this.motor.togglePowerSupply();
        this.updateAct2PowerUI();
      });
    }

    if (this.btnAct2ToggleCurrent) {
      this.btnAct2ToggleCurrent.addEventListener('click', () => {
        this.motor.toggleStraightWireCurrent();
        this.updateAct2PowerUI();
      });
    }

    // 场景2：装配换向器与电刷
    if (this.btnAct2ToggleCommutator) {
      this.btnAct2ToggleCommutator.addEventListener('click', () => {
        this.motor.setAct2Commutator(!this.motor.hasCommutator);
        this.updateAct2PowerUI();
        this.setupCustomActionsForAct(2);
      });
    }

    if (this.btnAct2ToggleBrushes) {
      this.btnAct2ToggleBrushes.addEventListener('click', () => {
        this.motor.setAct2Brushes(!this.motor.hasBrushes);
        this.updateAct2PowerUI();
        this.setupCustomActionsForAct(2);
      });
    }

    // 场景2：参数调节滑块联动
    if (this.act2SliderCurrent) {
      this.act2SliderCurrent.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        if (this.act2ValCurrent) this.act2ValCurrent.textContent = val.toFixed(1) + ' A';
        this.motor.setAct2Current(val);
      });
    }

    if (this.act2SliderField) {
      this.act2SliderField.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        if (this.act2ValField) this.act2ValField.textContent = val.toFixed(1) + ' T';
        this.motor.setAct2Field(val);
      });
    }

    // 场景2：转速倍率调节
    if (this.act2SliderSpeed) {
      this.act2SliderSpeed.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        if (this.act2ValSpeed) this.act2ValSpeed.textContent = val.toFixed(1) + '×';
        this.motor.setAct2SpeedScale(val);
      });
    }

    // 场景2：持续旋转暂停与单步推进
    if (this.btnAct2PauseSpin) {
      this.btnAct2PauseSpin.addEventListener('click', () => {
        this.motor.toggleAct2Pause();
        this.updateAct2PowerUI();
      });
    }

    if (this.btnAct2StepSpin) {
      this.btnAct2StepSpin.addEventListener('click', () => {
        this.motor.stepAct2Angle(15);
      });
    }

    // 场景2：电枢线圈组数模式切换 (单组 / 双组正交 / 多组密集)
    if (this.btnCoilMode1) {
      this.btnCoilMode1.addEventListener('click', () => {
        this.motor.setCoilGroupMode(1);
        this.updateAct2PowerUI();
      });
    }

    if (this.btnCoilMode2) {
      this.btnCoilMode2.addEventListener('click', () => {
        this.motor.setCoilGroupMode(2);
        this.updateAct2PowerUI();
      });
    }

    if (this.btnCoilMode3) {
      this.btnCoilMode3.addEventListener('click', () => {
        this.motor.setCoilGroupMode(3);
        this.updateAct2PowerUI();
      });
    }

    if (this.btnToggleCore) {
      this.btnToggleCore.addEventListener('click', () => {
        this.motor.setArmatureCoreVisibility(!this.motor.showArmatureCore);
        this.updateAct2PowerUI();
      });
    }

    // 支持直接在 3D 视图中点击电源机身船型开关
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();
    this.renderer.domElement.addEventListener('pointerdown', (e) => {
      if (this.currentActIndex !== 1) return;
      const rect = this.renderer.domElement.getBoundingClientRect();
      mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(mouse, this.camera);
      if (this.motor.psRockerMesh) {
        const hits = raycaster.intersectObject(this.motor.psRockerMesh, true);
        if (hits.length > 0) {
          this.motor.togglePowerSupply();
          this.updateAct2PowerUI();
        }
      }
    });

    // 1. 8 幕步骤条点击导航
    this.timelineSteps.forEach((stepEl, idx) => {
      stepEl.addEventListener('click', () => this.goToAct(idx));
    });

    this.btnPrevAct.addEventListener('click', () => this.changeAct(-1));
    this.btnNextAct.addEventListener('click', () => this.changeAct(1));

    // 2. 播放/暂停
    this.btnActPlayPause.addEventListener('click', () => this.toggleActPlayPause());

    // 3. 重放本幕
    this.btnActRestart.addEventListener('click', () => this.goToAct(this.currentActIndex));

    // 4. 键盘快捷键
    window.addEventListener('keydown', (e) => {
      switch (e.code) {
        case 'ArrowLeft':
          this.changeAct(-1);
          break;
        case 'ArrowRight':
          this.changeAct(1);
          break;
        case 'Space':
          e.preventDefault();
          this.toggleActPlayPause();
          break;
        case 'KeyF':
          this.toggleFullscreen();
          break;
        case 'KeyR':
          this.resetCamera();
          break;
      }
    });

    // 5. 视角与全屏
    this.btnFullscreen.addEventListener('click', () => this.toggleFullscreen());
    this.btnViewIso.addEventListener('click', () => this.setCameraView('iso'));
    this.btnViewFront.addEventListener('click', () => this.setCameraView('front'));
    this.btnViewTop.addEventListener('click', () => this.setCameraView('top'));
    this.btnViewBrush.addEventListener('click', () => this.setCameraView('brush'));
    this.btnResetCam.addEventListener('click', () => this.resetCamera());

    // 3D 标签开关
    this.btnToggleLabels.addEventListener('click', () => {
      this.motor.toggleLabels(!this.motor.showLabels);
      this.btnToggleLabels.classList.toggle('active', this.motor.showLabels);
    });

    // 6. 右侧面板控制
    this.btnToggleSpin.addEventListener('click', () => this.toggleActPlayPause());
    this.btnStepSpin.addEventListener('click', () => this.stepAngle(15));

    this.sliderSpeed.addEventListener('input', (e) => {
      const speed = parseFloat(e.target.value);
      this.motor.rotationSpeed = speed;
      this.valSpeed.textContent = `${speed.toFixed(1)}x`;
    });

    this.sliderAngle.addEventListener('input', (e) => {
      const deg = parseFloat(e.target.value);
      this.motor.isRotating = false;
      this.motor.isDampedMode = false;
      this.updatePlayPauseUI();
      this.motor.setAngleDegrees(deg);
      this.valManualAngle.textContent = `${Math.round(deg)}°`;
    });

    // 7. 观察模式
    Object.keys(this.modeButtons).forEach((modeKey) => {
      const btn = this.modeButtons[modeKey];
      if (btn) {
        btn.addEventListener('click', () => {
          Object.values(this.modeButtons).forEach((b) => b.classList.remove('active'));
          btn.classList.add('active');
          this.motor.setObservationMode(modeKey);
          if (modeKey === 'commutator_only') {
            this.animateCameraTo(3.2, 1.8, 4.2, [0, 0, 2.65]);
          } else if (modeKey === 'exploded') {
            this.animateCameraTo(9.5, 7.5, 10.5, [0, 0, 0]);
          } else if (modeKey === 'normal') {
            this.animateCameraTo(7.2, 5.5, 8.5, [0, 0, 0]);
          }
        });
      }
    });

    // 8. 矢量图层显隐
    Object.keys(this.vectorToggles).forEach((key) => {
      const el = this.vectorToggles[key];
      if (el) {
        el.addEventListener('change', (e) => {
          this.motor.setVisualLayerVisible(key, e.target.checked);
        });
      }
    });

    // 9. 零件显隐
    Object.keys(this.partToggles).forEach((key) => {
      const el = this.partToggles[key];
      if (el) {
        el.addEventListener('change', (e) => {
          this.motor.setPartVisibility(key, e.target.checked);
        });
      }
    });

    document.getElementById('btn-toggle-all-parts').addEventListener('click', () => {
      Object.keys(this.partToggles).forEach((key) => {
        this.partToggles[key].checked = true;
        this.motor.setPartVisibility(key, true);
      });
    });

    // 10. 抽屉折叠
    this.btnToggleDrawer.addEventListener('click', () => {
      this.sidePanel.classList.toggle('collapsed');
      this.btnToggleDrawer.textContent = this.sidePanel.classList.contains('collapsed') ? '⇤' : '⇥';
    });
  }

  // 步进指定度数
  stepAngle(degOffset) {
    this.motor.isRotating = false;
    this.motor.isDampedMode = false;
    this.updatePlayPauseUI();
    const cur = this.motor.getAngleDegrees();
    this.motor.setAngleDegrees(cur + degOffset);
    this.sliderAngle.value = Math.round(this.motor.getAngleDegrees());
    this.valManualAngle.textContent = `${this.sliderAngle.value}°`;
  }

  // ---------------- 8 幕核心切换与动态按钮调度 ----------------
  changeAct(dir) {
    const next = this.currentActIndex + dir;
    if (next >= 0 && next < this.acts.length) {
      this.goToAct(next);
    }
  }

  goToAct(actIndex) {
    this.currentActIndex = actIndex;
    const act = this.acts[actIndex];
    const actNum = actIndex + 1; // 1 ~ 8

    // 1. 更新顶部和底部 UI 步骤条高亮
    this.timelineSteps.forEach((stepEl, idx) => {
      stepEl.classList.toggle('active', idx === actIndex);
    });

    this.actNumberTag.textContent = `第 ${act.num} 幕 / 共 8 幕`;
    this.actTitleText.textContent = act.title;
    this.actDescText.textContent = act.desc;
    this.metricFormula.textContent = act.formula;

    this.btnPrevAct.disabled = actIndex === 0;
    this.btnNextAct.disabled = actIndex === this.acts.length - 1;

    // 2. 场景4专属提示浮层显隐
    if (actNum === 4) {
      this.act4NoteBanner.classList.remove('hidden');
    } else {
      this.act4NoteBanner.classList.add('hidden');
    }

    // 3. 调用 3D 模型切换到对应场景的内部状态
    this.motor.applySceneState(actNum);

    // 场景2专属左侧显眼电源控制卡片显隐与状态刷新 (同时规避左下角图例遮挡)
    const hudLegend = document.querySelector('.hud-legend');
    if (this.act2PowerPanel) {
      if (actNum === 2) {
        this.act2PowerPanel.classList.remove('hidden');
        if (hudLegend) hudLegend.classList.add('hidden');
        this.updateAct2PowerUI();
      } else {
        this.act2PowerPanel.classList.add('hidden');
        if (hudLegend) hudLegend.classList.remove('hidden');
      }
    }

    // 4. 动态配置专属动作按钮
    this.setupCustomActionsForAct(actNum);

    // 5. 侧边栏折叠自适应
    if (actNum < 7 && !this.sidePanel.classList.contains('collapsed')) {
      this.sidePanel.classList.add('collapsed');
      this.btnToggleDrawer.textContent = '⇤';
    } else if (actNum >= 7 && this.sidePanel.classList.contains('collapsed')) {
      this.sidePanel.classList.remove('collapsed');
      this.btnToggleDrawer.textContent = '⇥';
    }

    // 6. 相机平滑运镜
    if (act.camera) {
      this.animateCameraTo(act.camera.x, act.camera.y, act.camera.z, act.camera.target);
    }

    this.updatePlayPauseUI();
  }

  updateAct2PowerUI() {
    if (!this.act2PowerPanel) return;
    const isOn = this.motor.isPowerSupplyOn;
    const dir = this.motor.straightWireDirection;
    const hasComm = this.motor.hasCommutator;
    const hasBrushes = this.motor.hasBrushes;
    const mode = this.motor.coilGroupMode || 1;
    const isReady = mode >= 2 || (hasComm && hasBrushes);

    // 电源总开关按钮样式与文案
    if (isOn) {
      this.btnAct2MainPower.className = 'btn-power-switch on';
      if (this.act2PowerDot) this.act2PowerDot.className = 'power-status-dot active';
      if (this.act2SwitchMainText) this.act2SwitchMainText.textContent = '断开电源 (点击停止供电)';
      if (this.act2SwitchSubText) {
        if (mode === 3) {
          this.act2SwitchSubText.textContent = '🟢 8组密集电枢高频轮换 · 恒速平滑旋转中';
        } else if (mode === 2) {
          this.act2SwitchSubText.textContent = '🟢 双组正交线圈轮流做功 · 无死点平稳旋转';
        } else if (isReady) {
          this.act2SwitchSubText.textContent = '🟢 持续供电中 · 换向器工作 · 电机持续旋转';
        } else {
          this.act2SwitchSubText.textContent = '🟢 供电中 · 稳压12V输出 · 线框偏转至平衡位置';
        }
      }
    } else {
      this.btnAct2MainPower.className = 'btn-power-switch off';
      if (this.act2PowerDot) this.act2PowerDot.className = 'power-status-dot';
      if (this.act2SwitchMainText) this.act2SwitchMainText.textContent = '闭合电源 (通电)';
      if (this.act2SwitchSubText) {
        this.act2SwitchSubText.textContent = isReady
          ? '🔴 电机装配就绪 · 点击闭合开关启动持续旋转'
          : '🔴 当前断开 · 已标出电流流向 · 点击闭合';
      }
    }

    if (this.act2CurrentDirText) {
      this.act2CurrentDirText.textContent =
        dir === 1 ? '流向: 逆时针 (+红入 ➔ -绿出)' : '流向: 顺时针 (-黑入 ➔ +红出)';
    }

    // 装配按钮状态刷新
    if (this.btnAct2ToggleCommutator && this.act2BtnCommutatorText) {
      if (hasComm) {
        this.btnAct2ToggleCommutator.className = 'btn-assemble installed';
        this.btnAct2ToggleCommutator.querySelector('.btn-assemble-icon').textContent = '✓';
        this.act2BtnCommutatorText.textContent = '移除换向器';
      } else {
        this.btnAct2ToggleCommutator.className = 'btn-assemble';
        this.btnAct2ToggleCommutator.querySelector('.btn-assemble-icon').textContent = '➕';
        this.act2BtnCommutatorText.textContent = '添加换向器';
      }
    }

    if (this.btnAct2ToggleBrushes && this.act2BtnBrushesText) {
      if (hasBrushes) {
        this.btnAct2ToggleBrushes.className = 'btn-assemble installed';
        this.btnAct2ToggleBrushes.querySelector('.btn-assemble-icon').textContent = '✓';
        this.act2BtnBrushesText.textContent = '移除电刷';
      } else {
        this.btnAct2ToggleBrushes.className = 'btn-assemble';
        this.btnAct2ToggleBrushes.querySelector('.btn-assemble-icon').textContent = '➕';
        this.act2BtnBrushesText.textContent = '添加电刷';
      }
    }

    // 线圈组数升级按钮高亮
    if (this.btnCoilMode1) this.btnCoilMode1.classList.toggle('active', mode === 1);
    if (this.btnCoilMode2) this.btnCoilMode2.classList.toggle('active', mode === 2);
    if (this.btnCoilMode3) this.btnCoilMode3.classList.toggle('active', mode === 3);

    // 铁芯开关按钮
    if (this.btnToggleCore && this.act2BtnCoreText) {
      this.btnToggleCore.classList.toggle('active', this.motor.showArmatureCore);
      this.act2BtnCoreText.textContent = this.motor.showArmatureCore ? '转子铁芯: 开' : '转子铁芯: 关';
    }

    // 转矩特性标签刷新
    if (this.act2CoilRippleText) {
      if (mode === 1) {
        this.act2CoilRippleText.textContent = isReady
          ? '单组线圈 (2槽半圆片) · 转矩随 |cosθ| 脉动 100% (最低降为0)'
          : '单组线圈 (未装换向器) · 通电偏转至 90° 平衡位置停转';
      } else if (mode === 2) {
        this.act2CoilRippleText.textContent = '双组正交线圈 (4槽换向器，图1) · 轮流导通做功 · 转矩脉动率 29.3% (彻底无死点)';
      } else if (mode === 3) {
        this.act2CoilRippleText.textContent = '多组密集电枢 (16槽换向器，图2) · 8组线圈高频轮换 · 转矩波动率 < 2% (恒定高速平滑)';
      }
    }

    // 装配状态徽标与持续调控卡片
    if (this.act2AssemblyBadge && this.act2AssemblyBadgeText) {
      if (mode === 3) {
        this.act2AssemblyBadge.className = 'assembly-status-badge badge-ready';
        this.act2AssemblyBadgeText.textContent = '✅ 8组密集电枢 (16换向片 · 工业级平滑恒速)';
        if (this.act2ContinuousControls) this.act2ContinuousControls.classList.remove('hidden');
        if (this.act2HintText) {
          this.act2HintText.innerHTML =
            '【<strong>多组密集电枢升级（参考图2）</strong>】：工业电机采用 8 组径向对称线圈，配合 16 槽换向器圆柱与开槽硅钢铁芯。线圈以 22.5° 密集间隔连续轮换供电，<strong>转矩波动率小于 2%</strong>，实现几乎完美的恒定高速旋转，动力充沛强劲！';
        }
      } else if (mode === 2) {
        this.act2AssemblyBadge.className = 'assembly-status-badge badge-ready';
        this.act2AssemblyBadgeText.textContent = '✅ 双组正交电枢 (4换向片 · 彻底消除死点)';
        if (this.act2ContinuousControls) this.act2ContinuousControls.classList.remove('hidden');
        if (this.act2HintText) {
          this.act2HintText.innerHTML =
            '【<strong>双组正交线圈升级（参考图1）</strong>】：两组线圈成 90° 正交布置，换向器分为 4 片。当一组线圈转至力矩衰减角度时，电刷自动滑至另一组线圈，<strong>两组线圈轮流做功（轮流成为电磁铁）</strong>！转矩始终在 0.707~1.0 之间，<strong>彻底消除了单线圈死点</strong>，运转更加平稳！';
        }
      } else if (isReady) {
        this.act2AssemblyBadge.className = 'assembly-status-badge badge-ready';
        this.act2AssemblyBadgeText.textContent = '✅ 换向器+电刷已就绪 (将无限持续旋转)';
        if (this.act2ContinuousControls) this.act2ContinuousControls.classList.remove('hidden');
        if (this.act2HintText) {
          this.act2HintText.innerHTML =
            '已成功改装为<strong>完整直流电动机模型</strong>！半圆铜环换向器随线圈转动，固定电刷维持定点电流输入。线圈每转过平衡位置（90°/270°），两铜环自动互换接触电刷，<strong>电流自动反向</strong>，力矩方向保持恒定，电机<strong>无限持续旋转</strong>！';
        }
      } else {
        this.act2AssemblyBadge.className = 'assembly-status-badge badge-pending';
        if (hasComm && !hasBrushes) {
          this.act2AssemblyBadgeText.textContent = '已加换向器，尚缺电刷引入电流';
        } else if (!hasComm && hasBrushes) {
          this.act2AssemblyBadgeText.textContent = '已加固定电刷，尚缺换向铜环接触';
        } else {
          this.act2AssemblyBadgeText.textContent = '当前装置：单线框 (通电仅偏转90°)';
        }
        if (this.act2ContinuousControls) this.act2ContinuousControls.classList.add('hidden');
        if (this.act2HintText) {
          this.act2HintText.innerHTML =
            '断电时已在导线上标出<strong>电流流动方向</strong>（橙黄箭头）。请先用<strong>左手定则</strong>判断线框两侧安培力方向，再点击上方开关通电验证！若要让装置<strong>一直旋转下去</strong>，请点击上方装配<strong>换向器</strong>与<strong>电刷</strong>。';
        }
      }
    }

    // 暂停按钮状态
    if (this.act2PauseIcon && this.act2PauseText) {
      if (this.motor.act2IsPaused) {
        this.act2PauseIcon.textContent = '▶️';
        this.act2PauseText.textContent = '继续旋转';
      } else {
        this.act2PauseIcon.textContent = '⏸️';
        this.act2PauseText.textContent = '暂停观察';
      }
    }
  }

  setupCustomActionsForAct(actNum) {
    this.customActionSlot.innerHTML = '';

    if (actNum === 2) {
      // 场景2全部操作已高度集约整合在左侧专属“⚡ 实验装置与电源控制”面板中，底栏保持清爽无遮挡
    } else if (actNum === 3) {
      // 场景3：重新演示弯折演化动画
      const btnReplayMorph = document.createElement('button');
      btnReplayMorph.className = 'btn-act-special';
      btnReplayMorph.innerHTML = '<span>↺</span> 重新演示线圈形成';
      btnReplayMorph.addEventListener('click', () => {
        this.motor.startWireMorphingAnimation();
      });
      this.customActionSlot.appendChild(btnReplayMorph);
    } else if (actNum === 4) {
      // 场景4：重新演示阻尼摆动
      const btnReplayDamped = document.createElement('button');
      btnReplayDamped.className = 'btn-act-special';
      btnReplayDamped.innerHTML = '<span>↺</span> 重新演示阻尼停转';
      btnReplayDamped.addEventListener('click', () => {
        this.motor.startDampedOscillation();
        this.metricBrushState.textContent = '阻尼摆动减速中 (无换向器)';
      });
      this.customActionSlot.appendChild(btnReplayDamped);
    } else if (actNum === 5) {
      // 场景5：换向器正面轴向特写与侧面接触特写
      const btnFrontView = document.createElement('button');
      btnFrontView.className = 'btn-act-action';
      btnFrontView.innerHTML = '<span>🔍</span> 换向器正面 (绝缘缝)';
      btnFrontView.title = '正面观察两半圆铜环与中间明显的绝缘缝隙';
      btnFrontView.addEventListener('click', () => {
        this.animateCameraTo(0, 0.1, 5.8, [0, 0, 2.65]);
      });
      this.customActionSlot.appendChild(btnFrontView);

      const btnSideView = document.createElement('button');
      btnSideView.className = 'btn-act-action';
      btnSideView.innerHTML = '<span>🔍</span> 电刷侧面接触';
      btnSideView.title = '侧面观察电刷与铜环接触面及引线';
      btnSideView.addEventListener('click', () => {
        this.animateCameraTo(3.2, 1.8, 4.2, [0, 0, 2.65]);
      });
      this.customActionSlot.appendChild(btnSideView);
    } else if (actNum === 6) {
      // 场景6：慢放与步进
      const btnSlow = document.createElement('button');
      btnSlow.className = 'btn-act-action';
      btnSlow.innerHTML = '<span>🐢</span> 慢放 0.2x';
      btnSlow.addEventListener('click', () => {
        this.motor.rotationSpeed = this.motor.rotationSpeed === 0.2 ? 0.5 : 0.2;
        btnSlow.innerHTML = `<span>🐢</span> 速度 ${this.motor.rotationSpeed}x`;
      });
      this.customActionSlot.appendChild(btnSlow);

      const btnStep = document.createElement('button');
      btnStep.className = 'btn-act-action';
      btnStep.innerHTML = '<span>↷</span> 步进 10°';
      btnStep.addEventListener('click', () => this.stepAngle(10));
      this.customActionSlot.appendChild(btnStep);
    } else if (actNum === 8) {
      // 场景8：爆炸拆解/复原
      const btnExplode = document.createElement('button');
      btnExplode.className = 'btn-act-special';
      btnExplode.innerHTML = '<span>💥</span> 爆炸拆解 / 复原';
      btnExplode.addEventListener('click', () => {
        const isExploded = this.motor.targetExplodeProgress > 0.5;
        this.motor.setObservationMode(isExploded ? 'normal' : 'exploded');
        btnExplode.innerHTML = isExploded ? '<span>💥</span> 爆炸拆解' : '<span>🧩</span> 复原装配';
      });
      this.customActionSlot.appendChild(btnExplode);
    }
  }

  toggleActPlayPause() {
    if (this.motor.isDampedMode) {
      this.motor.isDampedMode = false;
      this.motor.isRotating = false;
    } else {
      this.motor.isRotating = !this.motor.isRotating;
    }
    this.updatePlayPauseUI();
  }

  updatePlayPauseUI() {
    const isRunning = this.motor.isRotating || this.motor.isDampedMode || this.motor.isMorphing;
    if (isRunning) {
      this.actPlayIcon.textContent = '⏸';
      this.btnActPlayPause.innerHTML = '<span id="act-play-icon">⏸</span> 暂停';
      this.spinIcon.textContent = '⏸';
      this.spinText.textContent = '暂停旋转';
    } else {
      this.actPlayIcon.textContent = '▶';
      this.btnActPlayPause.innerHTML = '<span id="act-play-icon">▶</span> 播放';
      this.spinIcon.textContent = '▶';
      this.spinText.textContent = '开始旋转';
    }
  }

  toggleFullscreen() {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen?.().catch((err) => {
        console.warn('全屏请求失败:', err);
      });
      this.btnFullscreen.innerHTML = '<span class="icon-expand">🗗</span> 退出全屏';
    } else {
      document.exitFullscreen?.();
      this.btnFullscreen.innerHTML = '<span class="icon-expand">⛶</span> 全屏演示';
    }
  }

  setCameraView(mode) {
    document.querySelectorAll('.view-preset-group .btn-subtle').forEach((b) => b.classList.remove('active'));
    switch (mode) {
      case 'iso':
        document.getElementById('btn-view-iso').classList.add('active');
        this.animateCameraTo(7.2, 5.5, 8.5, [0, 0, 0]);
        break;
      case 'front':
        document.getElementById('btn-view-front').classList.add('active');
        this.animateCameraTo(0, 1.2, 9.5, [0, 0, 0]);
        break;
      case 'top':
        document.getElementById('btn-view-top').classList.add('active');
        this.animateCameraTo(0.1, 10.5, 0.1, [0, 0, 0]);
        break;
      case 'brush':
        document.getElementById('btn-view-brush').classList.add('active');
        this.animateCameraTo(2.8, 1.8, 4.4, [0, 0, 2.65]);
        break;
    }
  }

  resetCamera() {
    const act = this.acts[this.currentActIndex];
    if (act && act.camera) {
      this.animateCameraTo(act.camera.x, act.camera.y, act.camera.z, act.camera.target);
    } else {
      this.setCameraView('iso');
    }
  }

  animateCameraTo(x, y, z, target = [0, 0, 0], duration = 30) {
    let frame = 0;
    const startPos = this.camera.position.clone();
    const endPos = new THREE.Vector3(x, y, z);
    const startTarget = this.controls.target.clone();
    const endTarget = new THREE.Vector3(...target);

    const step = () => {
      frame++;
      const t = frame / duration;
      const ease = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
      this.camera.position.lerpVectors(startPos, endPos, ease);
      this.controls.target.lerpVectors(startTarget, endTarget, ease);
      this.controls.update();

      if (frame < duration) {
        requestAnimationFrame(step);
      }
    };
    step();
  }

  onWindowResize() {
    const width = this.viewport.clientWidth;
    const height = this.viewport.clientHeight;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }

  animate() {
    requestAnimationFrame(this.animate);

    const delta = this.clock.getDelta();

    this.motor.update(delta);
    this.controls.update();

    const deg = this.motor.getAngleDegrees();
    this.metricAngle.textContent = `${deg.toFixed(1)}°`;

    if (this.motor.isRotating && this.motor.rotationSpeed > 0) {
      this.sliderAngle.value = Math.round(deg);
      this.valManualAngle.textContent = `${Math.round(deg)}°`;
    }

    // 状态判定
    if (this.currentActIndex === 1) {
      const mode = this.motor.coilGroupMode || 1;
      const isReady = mode >= 2 || (this.motor.hasCommutator && this.motor.hasBrushes);

      if (this.act2ActiveCoilText) {
        if (mode === 1) {
          this.act2ActiveCoilText.textContent = '工作: 单组矩形环';
        } else if (mode === 2) {
          this.act2ActiveCoilText.textContent = this.motor.activeCoilIndex === 1 ? '工作: 线圈A (水平推力)' : '工作: 线圈B (正交做功)';
        } else if (mode === 3) {
          this.act2ActiveCoilText.textContent = `工作: 第 ${this.motor.activeCoilIndex} 组电枢`;
        }
      }

      if (isReady) {
        if (this.motor.isPowerSupplyOn) {
          const contact = this.motor.act2CommutatorContactState;
          let contactDesc = '正向导通 (驱动转矩)';
          if (mode === 2) {
            contactDesc = this.motor.activeCoilIndex === 1 ? '线圈A导通 (|cosθ|≥0.707)' : '线圈B导通 (|sinθ|≥0.707)';
          } else if (mode === 3) {
            contactDesc = `第${this.motor.activeCoilIndex}组线圈导通 (连续轮换)`;
          } else {
            if (contact === 'neutral') contactDesc = '中性面换向 (I=0, 靠惯性越过)';
            else if (contact === 'reverse') contactDesc = '反向导通 (电流自动换向驱动)';
          }

          const fVal = (this.motor.act2CurrentA * 0.28 * this.motor.act2FieldB).toFixed(2);
          if (this.motor.act2IsPaused) {
            this.metricBrushState.textContent = `⏸️ 已暂停 · ${contactDesc} · 转角 ${deg.toFixed(1)}°`;
            this.metricBrushState.className = 'metric-value text-amber-300';
          } else {
            const modeTitle = mode === 3 ? '8组密集电枢(波动<2%)' : (mode === 2 ? '双组正交(脉动29%)' : '单组线圈');
            this.metricBrushState.textContent = `⚡ ${modeTitle}持续旋转 · ${contactDesc} · F=${fVal}N`;
            this.metricBrushState.className =
              contact === 'neutral' ? 'metric-value status-gap' : 'metric-value text-emerald-400';
          }
        } else {
          this.metricBrushState.textContent = '装置就绪 (具备换向器与电刷) · 点击闭合电源启动持续旋转';
          this.metricBrushState.className = 'metric-value text-cyan-400';
        }
      } else {
        if (this.motor.isPowerSupplyOn) {
          const targetDeg = this.motor.straightWireDirection === 1 ? '90.0°' : '-90.0°';
          const isSettled = Math.abs(Math.abs(deg) - 90) < 1.5 && Math.abs(this.motor.act2AngularVelocity) < 0.15;
          this.metricBrushState.textContent = isSettled
            ? `平衡位置稳定停转 (力矩归零 M=0, 转角=${deg.toFixed(1)}°)`
            : `受安培力转矩加速偏转中 (目标垂直面 ${targetDeg})`;
          this.metricBrushState.className = isSettled ? 'metric-value text-emerald-400' : 'metric-value text-amber-400';
        } else {
          const isFlat = Math.abs(deg) < 1.5 && Math.abs(this.motor.act2AngularVelocity) < 0.15;
          this.metricBrushState.textContent = isFlat
            ? '电源未接通 · 已标出电流流向 (水平参考面 0.0°)'
            : '电源已断开 (平缓回落至水平面中)';
          this.metricBrushState.className = 'metric-value text-amber-300';
        }
      }
    } else if (this.motor.isDampedMode) {
      this.metricBrushState.textContent = '无换向器: 阻尼衰减摆动至90°';
      this.metricBrushState.className = 'metric-value text-amber-400';
    } else if (this.motor.isMorphing) {
      this.metricBrushState.textContent = `导线折弯成矩形线圈中 (${Math.round(this.motor.morphProgress * 100)}%)`;
      this.metricBrushState.className = 'metric-value text-cyan-400';
    } else if (this.motor.currentFlowState === 'neutral') {
      this.metricBrushState.textContent = '中性面断开 (绝缘间隙换向)';
      this.metricBrushState.className = 'metric-value status-gap';
    } else if (this.motor.currentFlowState === 'reverse') {
      this.metricBrushState.textContent = '反向接通 (电流自动反向)';
      this.metricBrushState.className = 'metric-value status-active';
    } else if (this.motor.currentFlowState === 'forward') {
      this.metricBrushState.textContent = '正向接通 (正常驱动)';
      this.metricBrushState.className = 'metric-value status-active';
    }

    this.renderer.render(this.scene, this.camera);
  }
}

window.addEventListener('DOMContentLoaded', () => {
  new MotorLectureApp();
});
