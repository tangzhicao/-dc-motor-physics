import * as THREE from 'three';

/**
 * 3D 直流有刷电动机物理与教学演化模型 (DC Motor Physics & Pedagogical Model - Refined)
 * 精细化实现大学物理 8 幕渐进式教学：
 * 1. 纯磁极与平直磁感线 (无上方遮挡，0残留)
 * 2. 直导线时序展示与受力位移微弹 (先导线 ➔ 电流 ➔ 安培力，受力微动)
 * 3. 直导线弯折 ➔ U形 ➔ 闭合矩形线圈 ➔ 转轴穿入 ➔ 力偶旋转连续演化动画
 * 4. 严谨动力学惯性阻尼衰减摆动至 90° 停转 (带教学启发卡片)
 * 5. 双半圆分瓣铜环换向器重构 (大绝缘缝隙，正面/侧面特写观察)
 * 6. 慢速逐帧剖析换向微观过程 (死点断开 ➔ 极性反转 ➔ 力矩恒定)
 * 7. 完整电机稳态运转与多速调控
 * 8. 自由探究与爆炸拆解
 */
export class DCMotorModel {
  constructor() {
    this.root = new THREE.Group();
    this.root.name = 'DCMotor_Root';

    // 1. 旋转总成 (转子组 - 绕 Z 轴旋转)
    this.rotorGroup = new THREE.Group();
    this.rotorGroup.name = 'RotorGroup';
    this.root.add(this.rotorGroup);

    // 2. 静止总成 (定子组 - 磁极、支架、电刷、底座、外电源)
    this.statorGroup = new THREE.Group();
    this.statorGroup.name = 'StatorGroup';
    this.root.add(this.statorGroup);

    // 3. 电磁物理矢量图层
    this.vectorsGroup = new THREE.Group();
    this.vectorsGroup.name = 'VectorsGroup';
    this.root.add(this.vectorsGroup);

    // 4. 3D 文字标签层 (Billboards)
    this.labelsGroup = new THREE.Group();
    this.labelsGroup.name = 'LabelsGroup';
    this.root.add(this.labelsGroup);

    // 独立结构部件容器
    this.parts = {
      base: new THREE.Group(),
      magnetsLeftN: new THREE.Group(),
      magnetsRightS: new THREE.Group(),
      straightWireGroup: new THREE.Group(), // 幕2：独立通电直导线
      morphingWireGroup: new THREE.Group(), // 幕3：折弯演化线圈
      shaft: new THREE.Group(),
      armatureCore: new THREE.Group(),
      coil: new THREE.Group(),
      commutator: new THREE.Group(),
      brushLeft: new THREE.Group(),
      brushRight: new THREE.Group(),
      power: new THREE.Group(),
    };

    // 物理矢量图层引用表
    this.visuals = {
      bField: new THREE.Group(),
      straightWireCurrent: new THREE.Group(),
      straightWireForce: new THREE.Group(),
      coilCurrent: new THREE.Group(),
      coilForces: new THREE.Group(),
      rotationArc: new THREE.Group(),
    };

    // 爆炸拆解变换目标
    this.partTransforms = {
      base: { normal: new THREE.Vector3(0, 0, 0), exploded: new THREE.Vector3(0, -1.2, 0) },
      magnetsLeftN: { normal: new THREE.Vector3(0, 0, 0), exploded: new THREE.Vector3(-4.8, 0, 0) },
      magnetsRightS: { normal: new THREE.Vector3(0, 0, 0), exploded: new THREE.Vector3(4.8, 0, 0) },
      shaft: { normal: new THREE.Vector3(0, 0, 0), exploded: new THREE.Vector3(0, 2.6, 0) },
      armatureCore: { normal: new THREE.Vector3(0, 0, 0), exploded: new THREE.Vector3(0, 2.6, 0) },
      coil: { normal: new THREE.Vector3(0, 0, 0), exploded: new THREE.Vector3(0, 3.8, 0) },
      commutator: { normal: new THREE.Vector3(0, 0, 0), exploded: new THREE.Vector3(0, 2.6, 1.8) },
      brushLeft: { normal: new THREE.Vector3(0, 0, 0), exploded: new THREE.Vector3(-2.8, -0.6, 0) },
      brushRight: { normal: new THREE.Vector3(0, 0, 0), exploded: new THREE.Vector3(2.8, -0.6, 0) },
      power: { normal: new THREE.Vector3(0, 0, 0), exploded: new THREE.Vector3(-2.0, 0, 3.6) },
    };

    // 动力学状态
    this.currentAngle = 0; // 弧度
    this.angularVelocity = 0; // 弧度/秒
    this.rotationSpeed = 1.0;
    this.isRotating = false;
    this.currentFlowState = 'forward'; // 'forward' | 'neutral' | 'reverse'

    // 幕2：线框电流方向 (+1: 逆时针供电, -1: 顺时针供电) 与 90° 旋转阻尼动力学
    this.isPowerSupplyOn = false;
    this.straightWireDirection = 1;
    this.act2Angle = 0; // 当前转角 (0: 水平, π/2: 90° 垂直平衡面)
    this.act2AngularVelocity = 0; // 角速度

    // 幕2 交互装配升级：换向器与电刷系统
    this.hasCommutator = false;
    this.hasBrushes = false;
    this.act2CurrentA = 2.0; // 回路电流大小 (0.5A ~ 5.0A)
    this.act2FieldB = 1.0; // 磁场强度 (0.2T ~ 2.0T)
    this.act2SpeedScale = 1.0; // 转速倍率 (0.2x ~ 2.0x)
    this.act2IsPaused = false;
    this.act2CommutatorContactState = 'neutral'; // 'forward' | 'neutral' | 'reverse'

    // 电枢线圈与换向片组数升级 (1: 单组线圈, 2: 双组正交线圈, 3: 多组密集电枢)
    this.coilGroupMode = 1;
    this.showArmatureCore = true;
    this.activeCoilIndex = 1; // 1 ~ 8 当前主做功线圈组号

    // 幕3：直导线到线圈折弯形态演化进度 (0: 直线, 0.5: U形, 1.0: 闭合矩形)
    this.morphProgress = 0;
    this.isMorphing = false;
    this.morphStartTime = 0;

    // 幕4：无换向器真实物理阻尼摆动
    this.isDampedMode = false;

    // 爆炸拆解插值进度
    this.targetExplodeProgress = 0;
    this.currentExplodeProgress = 0;

    // 标签可见性 (默认关闭，教师点击顶部按钮按需开启)
    this.showLabels = false;
    this.labelsGroup.visible = false;

    // 初始化所有物理材质、模型网格与矢量系统
    this.initMaterials();
    this.buildBaseAndBearings();
    this.buildMagnets();
    this.buildStraightWire();
    this.buildMorphingWire();
    this.buildShaft();
    this.buildArmatureCore();
    this.buildRotorCoil();
    this.buildCommutator();
    this.buildBrushes();
    this.buildPowerSupplyAndWires();
    this.buildPhysicsVisualizers();
    this.buildLabels();

    // 默认进入场景 1
    this.applySceneState(1);
  }

  // ---------------- 物理基础材质库 (PBR) ----------------
  initMaterials() {
    this.materials = {
      // 漆包高光紫铜线
      copper: new THREE.MeshStandardMaterial({
        color: 0xdf7a36,
        metalness: 0.92,
        roughness: 0.16,
      }),
      // 黄铜分瓣换向片
      brass: new THREE.MeshStandardMaterial({
        color: 0xf59e0b,
        metalness: 0.95,
        roughness: 0.18,
      }),
      // 镜面镀铬不锈钢 (转轴)
      chrome: new THREE.MeshStandardMaterial({
        color: 0xf1f5f9,
        metalness: 0.98,
        roughness: 0.08,
      }),
      // 青铜减摩轴承套
      bronze: new THREE.MeshStandardMaterial({
        color: 0xd97706,
        metalness: 0.8,
        roughness: 0.3,
      }),
      // 叠片硅钢转子铁芯
      ironCore: new THREE.MeshStandardMaterial({
        color: 0x475569,
        metalness: 0.65,
        roughness: 0.45,
      }),
      // 哑光石墨碳刷
      carbon: new THREE.MeshStandardMaterial({
        color: 0x18181b,
        metalness: 0.05,
        roughness: 0.88,
      }),
      // N 极永磁体亮红烤漆
      magnetN: new THREE.MeshStandardMaterial({
        color: 0xef4444,
        metalness: 0.35,
        roughness: 0.3,
      }),
      // S 极永磁体湛蓝烤漆
      magnetS: new THREE.MeshStandardMaterial({
        color: 0x2563eb,
        metalness: 0.35,
        roughness: 0.3,
      }),
      // 软铁导磁极靴板
      poleShoe: new THREE.MeshStandardMaterial({
        color: 0x94a3b8,
        metalness: 0.75,
        roughness: 0.25,
      }),
      // 机座磨砂合金 (深青灰)
      baseChassis: new THREE.MeshStandardMaterial({
        color: 0x0f172a,
        metalness: 0.6,
        roughness: 0.4,
      }),
      // 绝缘耐磨黑尼龙套管
      insulator: new THREE.MeshStandardMaterial({
        color: 0x09090b,
        metalness: 0.02,
        roughness: 0.6,
      }),
      powerBox: new THREE.MeshStandardMaterial({
        color: 0x1e293b,
        metalness: 0.45,
        roughness: 0.35,
      }),
      wireRed: new THREE.MeshStandardMaterial({
        color: 0xdc2626,
        roughness: 0.35,
        metalness: 0.1,
      }),
      wireBlack: new THREE.MeshStandardMaterial({
        color: 0x18181b,
        roughness: 0.35,
        metalness: 0.1,
      }),

      // 幕2 专属高质感教学实验器材材质 (贴合参考图)
      wireGreen: new THREE.MeshStandardMaterial({
        color: 0x16a34a, // 鲜明翡翠绿绝缘层，与用户参考图一致
        roughness: 0.32,
        metalness: 0.15,
      }),
      // J1202A 型学生电源专用材质库
      powerSupplyCase: new THREE.MeshStandardMaterial({
        color: 0xe2e8f0, // 经典浅米白喷漆金属机箱
        roughness: 0.35,
        metalness: 0.2,
      }),
      powerSupplyPanel: new THREE.MeshStandardMaterial({
        color: 0xf8fafc, // 拉丝喷砂金属面板底色
        roughness: 0.28,
        metalness: 0.25,
      }),
      screwMetal: new THREE.MeshStandardMaterial({
        color: 0xcbd5e1, // 镀铬面板紧固螺钉
        roughness: 0.15,
        metalness: 0.95,
      }),
      postKnobRed: new THREE.MeshStandardMaterial({
        color: 0xdc2626, // 直流正极亮红旋钮端子
        roughness: 0.3,
        metalness: 0.15,
      }),
      postKnobBlack: new THREE.MeshStandardMaterial({
        color: 0x18181b, // 直流负极/交流哑黑旋钮端子
        roughness: 0.3,
        metalness: 0.15,
      }),
      postBrassCenter: new THREE.MeshStandardMaterial({
        color: 0xf59e0b, // 端子中心纯铜插拔孔
        roughness: 0.2,
        metalness: 0.9,
      }),
      ledGreen: new THREE.MeshStandardMaterial({
        color: 0x22c55e,
        emissive: 0x22c55e,
        emissiveIntensity: 0.85,
        roughness: 0.2,
      }),
      rockerBody: new THREE.MeshStandardMaterial({
        color: 0x09090b,
        roughness: 0.4,
        metalness: 0.1,
      }),
      knobBig: new THREE.MeshStandardMaterial({
        color: 0x1e293b,
        roughness: 0.35,
        metalness: 0.2,
      }),
      wireRedLead: new THREE.MeshStandardMaterial({
        color: 0xef4444, // 柔性正极红导线
        roughness: 0.4,
        metalness: 0.08,
      }),
      wireGreenLead: new THREE.MeshStandardMaterial({
        color: 0x22c55e, // 柔性负极绿导线
        roughness: 0.4,
        metalness: 0.08,
      }),
      clipMetal: new THREE.MeshStandardMaterial({
        color: 0x94a3b8, // 镀锌不锈钢鳄鱼夹咬合齿与金属躯干
        roughness: 0.18,
        metalness: 0.95,
      }),
      clipBootRed: new THREE.MeshStandardMaterial({
        color: 0xef4444, // 红色绝缘鳄鱼夹护套
        roughness: 0.38,
        metalness: 0.08,
      }),
      clipBootBlack: new THREE.MeshStandardMaterial({
        color: 0x18181b, // 黑色绝缘鳄鱼夹护套
        roughness: 0.38,
        metalness: 0.08,
      }),

      // 多组线圈轮换与电枢铁芯材质 (参考图1与图2)
      coilActiveMat: new THREE.MeshStandardMaterial({
        color: 0xf59e0b, // 通电高亮发光铜黄
        roughness: 0.22,
        metalness: 0.88,
        emissive: 0xd97706,
        emissiveIntensity: 0.55,
      }),
      coilDimMat: new THREE.MeshStandardMaterial({
        color: 0x854d0e, // 未导通断电暗铜
        roughness: 0.65,
        metalness: 0.5,
      }),
      armatureCoreMat: new THREE.MeshStandardMaterial({
        color: 0x2563eb, // 参考图1中高辨识度硅钢转子蓝芯
        roughness: 0.35,
        metalness: 0.75,
        transparent: true,
        opacity: 0.72,
      }),

      // 物理矢量高亮发光材质 (纯发光，穿透力强)
      bFieldMat: new THREE.MeshBasicMaterial({ color: 0x00f0ff }), // 磁场 - 亮青色
      currentMat: new THREE.MeshBasicMaterial({ color: 0xfbbf24 }), // 电流 - 橙黄色
      forceMat: new THREE.MeshBasicMaterial({ color: 0x22c55e }), // 安培力 - 翠绿色
      rotArcMat: new THREE.MeshBasicMaterial({ color: 0xf43f5e }), // 旋转/力矩 - 品红色
    };
  }

  // 1. 底座与前后轴承支架
  buildBaseAndBearings() {
    const group = this.parts.base;

    const basePlate = new THREE.Mesh(
      new THREE.BoxGeometry(9.6, 0.4, 9.6),
      this.materials.baseChassis
    );
    basePlate.position.y = -2.1;
    basePlate.castShadow = true;
    basePlate.receiveShadow = true;
    group.add(basePlate);

    const footGeo = new THREE.CylinderGeometry(0.35, 0.35, 0.18, 16);
    [
      [-4.2, -2.35, -4.2],
      [4.2, -2.35, -4.2],
      [-4.2, -2.35, 4.2],
      [4.2, -2.35, 4.2],
    ].forEach(([x, y, z]) => {
      const foot = new THREE.Mesh(footGeo, this.materials.insulator);
      foot.position.set(x, y, z);
      group.add(foot);
    });

    [-2.2, 2.2].forEach((x) => {
      const rail = new THREE.Mesh(
        new THREE.BoxGeometry(0.12, 0.05, 9.0),
        this.materials.chrome
      );
      rail.position.set(x, -1.88, 0);
      group.add(rail);
    });

    const createPillar = (zPos) => {
      const pGroup = new THREE.Group();
      pGroup.position.set(0, 0, zPos);

      const pMesh = new THREE.Mesh(
        new THREE.BoxGeometry(1.2, 2.9, 0.4),
        this.materials.baseChassis
      );
      pMesh.position.y = -0.55;
      pGroup.add(pMesh);

      const housing = new THREE.Mesh(
        new THREE.CylinderGeometry(0.55, 0.55, 0.5, 32),
        this.materials.baseChassis
      );
      housing.rotateX(Math.PI / 2);
      pGroup.add(housing);

      const bushing = new THREE.Mesh(
        new THREE.CylinderGeometry(0.34, 0.34, 0.52, 32),
        this.materials.bronze
      );
      bushing.rotateX(Math.PI / 2);
      pGroup.add(bushing);

      [-0.42, 0.42].forEach((x) => {
        const bolt = new THREE.Mesh(
          new THREE.CylinderGeometry(0.08, 0.08, 0.12, 6),
          this.materials.chrome
        );
        bolt.position.set(x, -1.85, 0.12);
        pGroup.add(bolt);
      });

      return pGroup;
    };

    group.add(createPillar(-3.8));
    group.add(createPillar(3.8));

    this.statorGroup.add(group);
  }

  // 2. 定子永磁体 (平直通透，顶部彻底无遮挡)
  buildMagnets() {
    const createPole = (isNorth) => {
      const group = isNorth ? this.parts.magnetsLeftN : this.parts.magnetsRightS;
      const xSign = isNorth ? -1 : 1;
      const mainMat = isNorth ? this.materials.magnetN : this.materials.magnetS;

      // 磁体方块本体 (N极左侧红、S极右侧蓝，外移拉宽间距)
      const block = new THREE.Mesh(
        new THREE.BoxGeometry(1.4, 2.5, 4.4),
        mainMat
      );
      block.position.set(xSign * 3.35, 0, 0);
      block.castShadow = true;
      group.add(block);

      // 磁极内侧平直软铁极板 (完全贴在磁体侧壁，顶部与中央 100% 通透，间距显著拉宽)
      const poleFace = new THREE.Mesh(
        new THREE.BoxGeometry(0.25, 2.4, 4.2),
        this.materials.poleShoe
      );
      poleFace.position.set(xSign * 2.55, 0, 0);
      group.add(poleFace);

      // 固定底座卡箍
      const clamp = new THREE.Mesh(
        new THREE.BoxGeometry(1.5, 0.45, 4.4),
        this.materials.baseChassis
      );
      clamp.position.set(xSign * 3.35, -1.6, 0);
      group.add(clamp);

      // 高清白字 N/S 铭牌
      const labelCanvas = document.createElement('canvas');
      labelCanvas.width = 512;
      labelCanvas.height = 512;
      const ctx = labelCanvas.getContext('2d');
      ctx.fillStyle = isNorth ? '#b91c1c' : '#1d4ed8';
      ctx.fillRect(0, 0, 512, 512);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 24;
      ctx.strokeRect(16, 16, 480, 480);

      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 340px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(isNorth ? 'N' : 'S', 256, 260);

      const labelTex = new THREE.CanvasTexture(labelCanvas);
      const labelMat = new THREE.MeshStandardMaterial({ map: labelTex, roughness: 0.3 });
      const labelMesh = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 1.3), labelMat);
      labelMesh.position.set(xSign * 4.08, 0.2, 0);
      labelMesh.rotateY(isNorth ? -Math.PI / 2 : Math.PI / 2);
      group.add(labelMesh);

      this.statorGroup.add(group);
    };

    createPole(true);  // N 极 (左侧红色)
    createPole(false); // S 极 (右侧蓝色)
  }

  // 3. 幕2：通电矩形线框与高拟真 J1202A 型学生电源实验装置 (贴合用户实物参考图)
  buildStraightWire() {
    const group = this.parts.straightWireGroup;

    // A. 偏转旋转子组 (包含三种电枢模式：单组线圈 / 双组正交 / 多组密集)
    this.straightWireMeshGroup = new THREE.Group();
    group.add(this.straightWireMeshGroup);

    // 共享镀铬主转轴
    const pivotShaft = new THREE.Mesh(
      new THREE.CylinderGeometry(0.025, 0.025, 4.6, 8),
      this.materials.chrome
    );
    pivotShaft.rotateX(Math.PI / 2);
    pivotShaft.position.set(0, 0, 0.25);
    this.straightWireMeshGroup.add(pivotShaft);

    // 固定支承底座 (不随线框偏转，直接加在 group)
    [-1.9, 2.2].forEach((z) => {
      const stand = new THREE.Mesh(
        new THREE.CylinderGeometry(0.08, 0.12, 1.2, 12),
        this.materials.insulator
      );
      stand.position.set(0, -0.6, z);
      group.add(stand);

      const bearingJewel = new THREE.Mesh(
        new THREE.CylinderGeometry(0.12, 0.12, 0.15, 12),
        this.materials.brass
      );
      bearingJewel.rotateX(Math.PI / 2);
      bearingJewel.position.set(0, 0, z);
      group.add(bearingJewel);
    });

    // 拟真鳄鱼夹构建函数
    const createAlligatorClip = (bootMat) => {
      const clipG = new THREE.Group();

      const jawLower = new THREE.Mesh(
        new THREE.BoxGeometry(0.08, 0.03, 0.32),
        this.materials.clipMetal
      );
      jawLower.position.set(0, -0.015, 0.1);
      clipG.add(jawLower);

      const jawUpper = new THREE.Mesh(
        new THREE.BoxGeometry(0.075, 0.03, 0.28),
        this.materials.clipMetal
      );
      jawUpper.position.set(0, 0.025, 0.09);
      jawUpper.rotateX(-0.12);
      clipG.add(jawUpper);

      const pin = new THREE.Mesh(
        new THREE.CylinderGeometry(0.025, 0.025, 0.12, 8),
        this.materials.clipMetal
      );
      pin.rotateZ(Math.PI / 2);
      pin.position.set(0, 0.01, -0.02);
      clipG.add(pin);

      const boot = new THREE.Mesh(
        new THREE.CylinderGeometry(0.065, 0.08, 0.35, 12),
        bootMat
      );
      boot.rotateX(Math.PI / 2);
      boot.position.set(0, 0, -0.22);
      clipG.add(boot);

      return clipG;
    };

    // 通用闭合线框生成器
    const createRectLoop = (w, l, wireR, mat) => {
      const pts = [
        new THREE.Vector3(-w / 2, 0, l / 2),
        new THREE.Vector3(-w / 2, 0, -l / 2),
        new THREE.Vector3(w / 2, 0, -l / 2),
        new THREE.Vector3(w / 2, 0, l / 2),
      ];
      const crv = new THREE.CatmullRomCurve3(pts, true, 'catmullrom', 0.12);
      const geo = new THREE.TubeGeometry(crv, 90, wireR, 10, true);
      const m = new THREE.Mesh(geo, mat);
      m.castShadow = true;
      return m;
    };

    // 通用多槽换向环生成器
    const createSegmentedCommutator = (numSegments, rIn, rOut, depth, gapAngleDeg) => {
      const g = new THREE.Group();
      g.position.set(0, 0, 2.45);
      const gapRad = (gapAngleDeg * Math.PI) / 180;
      const segSpan = (2 * Math.PI) / numSegments;
      const effectiveSpan = segSpan - gapRad;

      for (let s = 0; s < numSegments; s++) {
        const centerA = s * segSpan;
        const startA = centerA - effectiveSpan / 2;
        const endA = centerA + effectiveSpan / 2;

        const shape = new THREE.Shape();
        const steps = 16;
        for (let i = 0; i <= steps; i++) {
          const a = startA + (i / steps) * (endA - startA);
          const x = rOut * Math.cos(a);
          const y = rOut * Math.sin(a);
          if (i === 0) shape.moveTo(x, y);
          else shape.lineTo(x, y);
        }
        for (let i = steps; i >= 0; i--) {
          const a = startA + (i / steps) * (endA - startA);
          const x = rIn * Math.cos(a);
          const y = rIn * Math.sin(a);
          shape.lineTo(x, y);
        }
        shape.closePath();

        const geo = new THREE.ExtrudeGeometry(shape, {
          depth: depth,
          bevelEnabled: true,
          bevelThickness: 0.008,
          bevelSize: 0.008,
          bevelSegments: 2,
        });
        geo.translate(0, 0, -depth / 2);
        const mesh = new THREE.Mesh(geo, this.materials.brass);
        g.add(mesh);
      }
      return g;
    };

    // ---------------- 电枢模式 1：单组长方形漆包线框与大口径双半环换向器 ----------------
    this.act2Mode1Group = new THREE.Group();
    this.straightWireMeshGroup.add(this.act2Mode1Group);

    const halfW = 1.45;
    const halfL = 1.7;
    const loopPoints = [
      new THREE.Vector3(-1.15, 0, 2.45), // 左端子引出点 (接负极鳄鱼夹)
      new THREE.Vector3(-halfW, 0, 1.8), // 左有效边前拐点
      new THREE.Vector3(-halfW, 0, -halfL), // 左有效边后拐点
      new THREE.Vector3(-1.1, 0, -halfL - 0.2), // 后左圆角
      new THREE.Vector3(0, 0, -halfL - 0.2), // 后横梁中心 (平行于磁场 B, F=0)
      new THREE.Vector3(1.1, 0, -halfL - 0.2), // 后右圆角
      new THREE.Vector3(halfW, 0, -halfL), // 右有效边后拐点
      new THREE.Vector3(halfW, 0, 1.8), // 右有效边前拐点
      new THREE.Vector3(1.15, 0, 2.45), // 右端子引出点 (接正极鳄鱼夹)
    ];
    const loopCurve = new THREE.CatmullRomCurve3(loopPoints, false, 'catmullrom', 0.15);
    const loopGeo = new THREE.TubeGeometry(loopCurve, 110, 0.058, 12, false);
    const loopMesh = new THREE.Mesh(loopGeo, this.materials.wireGreen);
    loopMesh.castShadow = true;
    this.act2Mode1Group.add(loopMesh);

    // 单线框前段两端紫铜接线头
    [-1.15, 1.15].forEach((x) => {
      const copperTip = new THREE.Mesh(
        new THREE.CylinderGeometry(0.068, 0.068, 0.24, 16),
        this.materials.copper
      );
      copperTip.rotateX(Math.PI / 2);
      copperTip.position.set(x, 0, 2.45);
      this.act2Mode1Group.add(copperTip);
    });

    // 鳄鱼夹
    const clipLoopLeft = createAlligatorClip(this.materials.clipBootBlack);
    clipLoopLeft.position.set(-1.15, 0, 2.45);
    clipLoopLeft.rotation.set(0, 0.35, 0);
    this.act2Mode1Group.add(clipLoopLeft);

    const clipLoopRight = createAlligatorClip(this.materials.clipBootRed);
    clipLoopRight.position.set(1.15, 0, 2.45);
    clipLoopRight.rotation.set(0, -0.35, 0);
    this.act2Mode1Group.add(clipLoopRight);

    this.act2ClipLoopLeft = clipLoopLeft;
    this.act2ClipLoopRight = clipLoopRight;

    // 单组专属大口径双半环换向器
    this.act2CommutatorGroup = createSegmentedCommutator(2, 1.16, 1.26, 0.26, 18);
    [
      [1.18, 0], [-1.18, 0]
    ].forEach(([sx, sy]) => {
      const sp = new THREE.Mesh(
        new THREE.CylinderGeometry(0.045, 0.045, 0.24, 12),
        this.materials.copper
      );
      sp.rotateZ(Math.PI / 2);
      sp.position.set(sx, sy, 0);
      this.act2CommutatorGroup.add(sp);
    });
    this.act2CommutatorGroup.visible = false;
    this.act2Mode1Group.add(this.act2CommutatorGroup);

    // ---------------- 电枢模式 2：双组正交线圈与 4 槽换向器 (参考图 1) ----------------
    this.act2Mode2Group = new THREE.Group();
    this.act2Mode2Group.visible = false;
    this.straightWireMeshGroup.add(this.act2Mode2Group);

    // 线圈 A (水平，夹角 0°)
    this.act2Coil2A = createRectLoop(2.4, 3.4, 0.056, this.materials.coilActiveMat);
    this.act2Mode2Group.add(this.act2Coil2A);

    // 线圈 B (垂直，夹角 90° 正交)
    this.act2Coil2B = createRectLoop(2.4, 3.4, 0.056, this.materials.coilDimMat);
    this.act2Coil2B.rotateZ(Math.PI / 2);
    this.act2Mode2Group.add(this.act2Coil2B);

    // 转子硅钢铁芯 (参考图 1 蓝芯)
    this.act2ArmatureCore2 = new THREE.Group();
    const coreBox1 = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.38, 3.1), this.materials.armatureCoreMat);
    const coreBox2 = new THREE.Mesh(new THREE.BoxGeometry(0.38, 2.1, 3.1), this.materials.armatureCoreMat);
    this.act2ArmatureCore2.add(coreBox1);
    this.act2ArmatureCore2.add(coreBox2);
    this.act2Mode2Group.add(this.act2ArmatureCore2);

    // 4 槽圆柱换向器 (每个 90°，气隙约 8°)
    this.act2Commutator4Group = createSegmentedCommutator(4, 1.16, 1.26, 0.28, 8);
    [
      [1.21, 0], [-1.21, 0], [0, 1.21], [0, -1.21]
    ].forEach(([sx, sy]) => {
      const sp = new THREE.Mesh(
        new THREE.CylinderGeometry(0.04, 0.04, 0.22, 10),
        this.materials.copper
      );
      sp.position.set(sx, sy, 0);
      if (Math.abs(sx) > 0.01) sp.rotateZ(Math.PI / 2);
      this.act2Commutator4Group.add(sp);
    });
    this.act2Mode2Group.add(this.act2Commutator4Group);

    // ---------------- 电枢模式 3：多组密集电枢与 16 槽换向器 (参考图 2) ----------------
    this.act2Mode3Group = new THREE.Group();
    this.act2Mode3Group.visible = false;
    this.straightWireMeshGroup.add(this.act2Mode3Group);

    this.act2Mode3Coils = [];
    for (let k = 0; k < 8; k++) {
      const phi = (k * Math.PI) / 8;
      const cMesh = createRectLoop(2.32, 3.4, 0.042, this.materials.coilDimMat);
      cMesh.rotateZ(phi);
      this.act2Mode3Coils.push(cMesh);
      this.act2Mode3Group.add(cMesh);
    }

    // 圆柱形开槽转子铁芯 (参考图 2)
    const coreCyl = new THREE.Mesh(
      new THREE.CylinderGeometry(1.02, 1.02, 3.2, 32),
      this.materials.armatureCoreMat
    );
    coreCyl.rotateX(Math.PI / 2);
    this.act2ArmatureCore3 = coreCyl;
    this.act2Mode3Group.add(coreCyl);

    // 16 槽紧凑电枢换向器 (参考图 2)
    this.act2Commutator16Group = createSegmentedCommutator(16, 1.16, 1.25, 0.32, 4.2);
    for (let k = 0; k < 16; k++) {
      const spA = (k * 2 * Math.PI) / 16;
      const sp = new THREE.Mesh(
        new THREE.CylinderGeometry(0.028, 0.028, 0.22, 8),
        this.materials.copper
      );
      sp.position.set(1.15 * Math.cos(spA), 1.15 * Math.sin(spA), 0);
      sp.rotation.z = spA + Math.PI / 2;
      this.act2Commutator16Group.add(sp);
    }
    this.act2Mode3Group.add(this.act2Commutator16Group);

    // A3. 幕2 专属固定侧边电刷 (深度贴合参考图1，可交互动态挂载)
    this.act2BrushesGroup = new THREE.Group();

    const createBrushAssembly = (posX, isRight) => {
      const brushG = new THREE.Group();
      brushG.position.set(posX, 0, 2.45);

      const brushBlock = new THREE.Mesh(
        new THREE.BoxGeometry(0.18, 0.14, 0.22),
        this.materials.chrome
      );
      brushG.add(brushBlock);

      const termLug = new THREE.Mesh(
        new THREE.CylinderGeometry(0.04, 0.04, 0.14, 12),
        isRight ? this.materials.wireRedLead : this.materials.wireGreenLead
      );
      termLug.rotateZ(Math.PI / 2);
      termLug.position.set(isRight ? 0.12 : -0.12, 0, 0);
      brushG.add(termLug);

      const postMesh = new THREE.Mesh(
        new THREE.CylinderGeometry(0.05, 0.065, 2.04, 12),
        this.materials.insulator
      );
      postMesh.position.set(isRight ? 0.06 : -0.06, -1.05, 0);
      brushG.add(postMesh);

      const flange = new THREE.Mesh(
        new THREE.CylinderGeometry(0.12, 0.14, 0.08, 16),
        this.materials.baseChassis
      );
      flange.position.set(isRight ? 0.06 : -0.06, -2.05, 0);
      brushG.add(flange);

      return brushG;
    };

    this.act2BrushRight = createBrushAssembly(1.36, true);
    this.act2BrushesGroup.add(this.act2BrushRight);

    this.act2BrushLeft = createBrushAssembly(-1.36, false);
    this.act2BrushesGroup.add(this.act2BrushLeft);

    this.act2BrushesGroup.visible = false;
    group.add(this.act2BrushesGroup);

    // B. 高拟真“J1202A型学生电源” (前侧左方外移 X = -4.3, Z = 5.2，彻底拉开空间！)
    const psGroup = new THREE.Group();
    psGroup.position.set(-4.3, -0.55, 5.2);
    psGroup.rotation.y = 0.52; // 面向课件主观察视角，使面板与铭牌清晰可见

    const psW = 2.4;
    const psH = 1.4;
    const psD = 1.5;

    // 1. 米白金属机壳
    const caseMesh = new THREE.Mesh(
      new THREE.BoxGeometry(psW, psH, psD),
      this.materials.powerSupplyCase
    );
    caseMesh.position.y = psH / 2;
    caseMesh.castShadow = true;
    psGroup.add(caseMesh);

    // 4 个防滑橡胶底脚
    const footGeo = new THREE.CylinderGeometry(0.08, 0.09, 0.08, 12);
    [
      [-psW / 2 + 0.15, -psD / 2 + 0.15],
      [psW / 2 - 0.15, -psD / 2 + 0.15],
      [-psW / 2 + 0.15, psD / 2 - 0.15],
      [psW / 2 - 0.15, psD / 2 - 0.15],
    ].forEach(([fx, fz]) => {
      const f = new THREE.Mesh(footGeo, this.materials.rockerBody);
      f.position.set(fx, 0.04, fz);
      psGroup.add(f);
    });

    // 2. 高精度面板丝印贴图 (依据用户实物参考图绘制)
    const pCanvas = document.createElement('canvas');
    pCanvas.width = 1024;
    pCanvas.height = 600;
    const pctx = pCanvas.getContext('2d');

    // 面板背景：浅色微拉丝米白
    pctx.fillStyle = '#f8fafc';
    pctx.fillRect(0, 0, 1024, 600);

    // 灰色边框线条
    pctx.strokeStyle = '#94a3b8';
    pctx.lineWidth = 6;
    pctx.strokeRect(16, 16, 992, 568);

    // 标题：J1202A型学生电源
    pctx.fillStyle = '#0f172a';
    pctx.font = 'bold 44px sans-serif';
    pctx.textAlign = 'left';
    pctx.fillText('J1202A型学生电源', 140, 100);

    // 指示灯说明文字：电源 开关
    pctx.font = 'bold 26px sans-serif';
    pctx.textAlign = 'center';
    pctx.fillText('电源', 255, 230);
    pctx.fillText('开关', 345, 230);

    // 左下：直流电 及 + / - 极性标识
    pctx.font = 'bold 30px sans-serif';
    pctx.fillText('直流电', 170, 310);
    pctx.font = 'bold 36px sans-serif';
    pctx.fillStyle = '#dc2626';
    pctx.fillText('+', 120, 370);
    pctx.fillStyle = '#0f172a';
    pctx.fillText('—', 220, 370);

    // 中下：交流电 及 ~ / ~ 标识
    pctx.font = 'bold 30px sans-serif';
    pctx.fillText('交流电', 400, 310);
    pctx.font = 'bold 36px sans-serif';
    pctx.fillText('~', 355, 370);
    pctx.fillText('~', 445, 370);

    // 右侧：电压调节刻度盘数字 2 4 6 8 10 12 14 16
    pctx.font = 'bold 24px sans-serif';
    const scaleNums = ['2', '4', '6', '8', '10', '12', '14', '16'];
    const knobCx = 690;
    const knobCy = 330;
    const knobR = 145;
    scaleNums.forEach((num, idx) => {
      const angle = Math.PI * 0.75 + (idx / (scaleNums.length - 1)) * Math.PI * 1.5;
      const nx = knobCx + Math.cos(angle) * knobR;
      const ny = knobCy + Math.sin(angle) * knobR;
      pctx.fillText(num, nx, ny);
    });

    // 右下：开关标签
    pctx.font = 'bold 28px sans-serif';
    pctx.fillText('开关', 770, 560);

    const panelTex = new THREE.CanvasTexture(pCanvas);
    const panelMat = new THREE.MeshStandardMaterial({
      map: panelTex,
      roughness: 0.28,
      metalness: 0.15,
    });
    const panelMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(psW - 0.08, psH - 0.08),
      panelMat
    );
    panelMesh.position.set(0, psH / 2, psD / 2 + 0.005);
    psGroup.add(panelMesh);

    // 4 角镀铬紧固螺栓
    [
      [-psW / 2 + 0.12, psH - 0.12],
      [psW / 2 - 0.12, psH - 0.12],
      [-psW / 2 + 0.12, 0.12],
      [psW / 2 - 0.12, 0.12],
    ].forEach(([sx, sy]) => {
      const sc = new THREE.Mesh(
        new THREE.CylinderGeometry(0.045, 0.045, 0.02, 12),
        this.materials.screwMetal
      );
      sc.rotateX(Math.PI / 2);
      sc.position.set(sx, sy, psD / 2 + 0.015);
      psGroup.add(sc);
    });

    // 3. 双绿色指示灯
    this.psLedPower = new THREE.Mesh(
      new THREE.SphereGeometry(0.038, 16, 8),
      this.materials.ledGreen
    );
    this.psLedPower.position.set(-0.6, psH * 0.72, psD / 2 + 0.025);
    psGroup.add(this.psLedPower);

    this.psLedSwitch = new THREE.Mesh(
      new THREE.SphereGeometry(0.038, 16, 8),
      this.materials.ledGreen
    );
    this.psLedSwitch.position.set(-0.38, psH * 0.72, psD / 2 + 0.025);
    psGroup.add(this.psLedSwitch);

    // 4. 四个教学仪器接线柱 (带中心铜孔与宽间距棱纹旋钮)
    const createBindingPost = (knobMat, px, py) => {
      const bpG = new THREE.Group();
      bpG.position.set(px, py, psD / 2 + 0.01);

      // 绝缘底座垫圈
      const baseRing = new THREE.Mesh(
        new THREE.CylinderGeometry(0.09, 0.09, 0.03, 16),
        this.materials.rockerBody
      );
      baseRing.rotateX(Math.PI / 2);
      bpG.add(baseRing);

      // 旋钮柱身 (微倒角棱纹)
      const knob = new THREE.Mesh(
        new THREE.CylinderGeometry(0.075, 0.07, 0.18, 12),
        knobMat
      );
      knob.rotateX(Math.PI / 2);
      knob.position.z = 0.09;
      bpG.add(knob);

      // 中心纯铜插孔
      const core = new THREE.Mesh(
        new THREE.CylinderGeometry(0.028, 0.028, 0.2, 12),
        this.materials.postBrassCenter
      );
      core.rotateX(Math.PI / 2);
      core.position.z = 0.1;
      bpG.add(core);

      return bpG;
    };

    // 直流正极 (+ 亮红)
    const postPos = createBindingPost(this.materials.postKnobRed, -0.92, psH * 0.32);
    psGroup.add(postPos);

    // 直流负极 (- 哑黑，两者间距拉大至 0.48，不挤塞！)
    const postNeg = createBindingPost(this.materials.postKnobBlack, -0.44, psH * 0.32);
    psGroup.add(postNeg);

    // 交流两极 (~ ~)
    const postAc1 = createBindingPost(this.materials.postKnobBlack, -0.12, psH * 0.32);
    psGroup.add(postAc1);
    const postAc2 = createBindingPost(this.materials.postKnobBlack, 0.22, psH * 0.32);
    psGroup.add(postAc2);

    // 5. 大电压调节旋钮 (八角瓣造型带刻度指针对准 12V)
    const bigKnobG = new THREE.Group();
    this.psBigKnobGroup = bigKnobG;
    bigKnobG.position.set(0.48, psH * 0.45, psD / 2 + 0.01);

    const knobBody = new THREE.Mesh(
      new THREE.CylinderGeometry(0.24, 0.26, 0.18, 8),
      this.materials.knobBig
    );
    knobBody.rotateX(Math.PI / 2);
    knobBody.position.z = 0.09;
    bigKnobG.add(knobBody);

    const pointer = new THREE.Mesh(
      new THREE.BoxGeometry(0.035, 0.18, 0.04),
      this.materials.screwMetal
    );
    pointer.position.set(0.08, 0.08, 0.18);
    pointer.rotateZ(0.65); // 指向 12V 刻度
    bigKnobG.add(pointer);
    psGroup.add(bigKnobG);

    // 6. 船型电源开关 (带 I/O 标志与翻折交互)
    const switchG = new THREE.Group();
    switchG.position.set(0.65, psH * 0.18, psD / 2 + 0.01);

    const swBezel = new THREE.Mesh(
      new THREE.BoxGeometry(0.18, 0.28, 0.03),
      this.materials.rockerBody
    );
    swBezel.position.z = 0.015;
    switchG.add(swBezel);

    this.psRockerMesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.14, 0.22, 0.06),
      new THREE.MeshStandardMaterial({ color: 0x18181b, roughness: 0.3 })
    );
    this.psRockerMesh.position.z = 0.04;
    this.psRockerMesh.rotateX(0.25); // 初始处于 'I' (开启) 状态
    switchG.add(this.psRockerMesh);

    psGroup.add(switchG);
    group.add(psGroup);

    // C. 两根加长柔性接线与香蕉插头 (真实实验器材造型，绝不穿透机箱！)
    const localPosWorld = (lx, ly, lz) => {
      const v = new THREE.Vector3(lx, ly, lz);
      v.applyAxisAngle(new THREE.Vector3(0, 1, 0), psGroup.rotation.y);
      v.add(psGroup.position);
      return v;
    };

    // 工业标准 4mm 香蕉插头构建器 (插在接线柱正面)
    const createBananaPlug = (bootMat) => {
      const plugG = new THREE.Group();
      const pin = new THREE.Mesh(
        new THREE.CylinderGeometry(0.026, 0.026, 0.16, 12),
        this.materials.postBrassCenter
      );
      pin.rotateX(Math.PI / 2);
      pin.position.z = 0.06;
      plugG.add(pin);

      const handle = new THREE.Mesh(
        new THREE.CylinderGeometry(0.052, 0.052, 0.22, 16),
        bootMat
      );
      handle.rotateX(Math.PI / 2);
      handle.position.z = 0.20;
      plugG.add(handle);

      const tail = new THREE.Mesh(
        new THREE.CylinderGeometry(0.038, 0.052, 0.14, 12),
        bootMat
      );
      tail.rotateX(Math.PI / 2);
      tail.position.z = 0.38;
      plugG.add(tail);

      return plugG;
    };

    // 正负极香蕉插头插入电源端子
    const plugPos = createBananaPlug(this.materials.postKnobRed);
    plugPos.position.set(-0.92, psH * 0.32, psD / 2 + 0.18);
    psGroup.add(plugPos);

    const plugNeg = createBananaPlug(this.materials.postKnobBlack);
    plugNeg.position.set(-0.44, psH * 0.32, psD / 2 + 0.18);
    psGroup.add(plugNeg);

    // 插头尾部出线点世界坐标 (在机箱正面外侧空间)
    const pDcPosTipWorld = localPosWorld(-0.92, psH * 0.32, psD / 2 + 0.63);
    const pDcNegTipWorld = localPosWorld(-0.44, psH * 0.32, psD / 2 + 0.63);
    const normalWorld = new THREE.Vector3(0, 0, 1).applyAxisAngle(new THREE.Vector3(0, 1, 0), psGroup.rotation.y);

    // 导线 1 (红色正极接线)：从正极插头沿面板法向引出，在机箱前方大空间自然弧线连接至右引脚鳄鱼夹
    const pFrameRightWorld = new THREE.Vector3(halfW, 0, 2.45 - 0.1);
    this.wireRedPoints = [
      pDcPosTipWorld.clone(),
      pDcPosTipWorld.clone().add(normalWorld.clone().multiplyScalar(0.55)),
      new THREE.Vector3(-2.6, 0.35, 6.4),
      new THREE.Vector3(-0.8, 0.55, 5.0),
      new THREE.Vector3(0.6, 0.35, 3.7),
      pFrameRightWorld,
    ];
    this.wireRedCurve = new THREE.CatmullRomCurve3(this.wireRedPoints, false, 'centripetal', 0.2);
    this.wireRedMesh = new THREE.Mesh(
      new THREE.TubeGeometry(this.wireRedCurve, 50, 0.042, 8, false),
      this.materials.wireRedLead
    );
    group.add(this.wireRedMesh);

    // 导线 2 (绿色负极接线)：从左引脚鳄鱼夹出发，在大空间跨越并沿法向接入负极插头
    const pFrameLeftWorld = new THREE.Vector3(-halfW, 0, 2.45 - 0.1);
    this.wireGreenPoints = [
      pFrameLeftWorld,
      new THREE.Vector3(-1.2, 0.35, 3.7),
      new THREE.Vector3(-2.0, 0.55, 4.8),
      new THREE.Vector3(-2.9, 0.35, 6.1),
      pDcNegTipWorld.clone().add(normalWorld.clone().multiplyScalar(0.55)),
      pDcNegTipWorld.clone(),
    ];
    this.wireGreenCurve = new THREE.CatmullRomCurve3(this.wireGreenPoints, false, 'centripetal', 0.2);
    this.wireGreenMesh = new THREE.Mesh(
      new THREE.TubeGeometry(this.wireGreenCurve, 50, 0.042, 8, false),
      this.materials.wireGreenLead
    );
    group.add(this.wireGreenMesh);

    // D. 物理矢量：统一逆时针电流流动指示箭头 (断电与通电时均完整呈现回路流向！)
    this.visuals.straightWireCurrent.clear();

    const createCurArrow = () => {
      const g = new THREE.Group();
      const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.52, 8), this.materials.currentMat);
      const head = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.24, 12), this.materials.currentMat);
      head.position.y = 0.34;
      g.add(stem);
      g.add(head);
      return g;
    };

    // 1. 柔性进出线缆上的电流箭头 (置于静止空间，顺导线切线切面流动，每个长导线配双箭头)
    this.act2ArrowLeadIn1 = createCurArrow();
    this.visuals.straightWireCurrent.add(this.act2ArrowLeadIn1);
    this.act2ArrowLeadIn2 = createCurArrow();
    this.visuals.straightWireCurrent.add(this.act2ArrowLeadIn2);

    this.act2ArrowLeadOut1 = createCurArrow();
    this.visuals.straightWireCurrent.add(this.act2ArrowLeadOut1);
    this.act2ArrowLeadOut2 = createCurArrow();
    this.visuals.straightWireCurrent.add(this.act2ArrowLeadOut2);
    group.add(this.visuals.straightWireCurrent);

    // 2. 线框本体上的电流箭头 (置于线框旋转组中，随线框旋转)
    this.straightWireLoopCurrent = new THREE.Group();

    // 右侧有效边：两枚箭头沿导线指示
    this.act2ArrowRightCurrent1 = createCurArrow();
    this.act2ArrowRightCurrent1.position.set(halfW, 0.12, 0.7);
    this.straightWireLoopCurrent.add(this.act2ArrowRightCurrent1);

    this.act2ArrowRightCurrent2 = createCurArrow();
    this.act2ArrowRightCurrent2.position.set(halfW, 0.12, -0.7);
    this.straightWireLoopCurrent.add(this.act2ArrowRightCurrent2);

    // 后横梁：一枚箭头沿 -X 方向
    this.act2ArrowBackCurrent = createCurArrow();
    this.act2ArrowBackCurrent.position.set(0, 0.12, -halfL - 0.2);
    this.straightWireLoopCurrent.add(this.act2ArrowBackCurrent);

    // 左侧有效边：两枚箭头沿导线指示
    this.act2ArrowLeftCurrent1 = createCurArrow();
    this.act2ArrowLeftCurrent1.position.set(-halfW, 0.12, -0.7);
    this.straightWireLoopCurrent.add(this.act2ArrowLeftCurrent1);

    this.act2ArrowLeftCurrent2 = createCurArrow();
    this.act2ArrowLeftCurrent2.position.set(-halfW, 0.12, 0.7);
    this.straightWireLoopCurrent.add(this.act2ArrowLeftCurrent2);

    this.straightWireMeshGroup.add(this.straightWireLoopCurrent);

    // E. 物理矢量：两侧安培力矢量 (严格保持铅垂方向，置于静止参考系中，不随线框倾斜翻转)
    this.visuals.straightWireForce.clear();

    const createForceArrow = () => {
      const g = new THREE.Group();
      const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 1.15, 12), this.materials.forceMat);
      const head = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.35, 16), this.materials.forceMat);
      head.position.y = 0.72;
      g.add(stem);
      g.add(head);
      return g;
    };

    // 左侧安培力：电流向前(+Z)，磁场向右(+X) ⟹ 左手定则受力向上 (+Y)
    this.act2ArrowLeftForce = createForceArrow();
    this.act2ArrowLeftForce.position.set(-halfW, 0, 0);
    this.visuals.straightWireForce.add(this.act2ArrowLeftForce);

    // 右侧安培力：电流向后(-Z)，磁场向右(+X) ⟹ 左手定则受力向下 (-Y)
    this.act2ArrowRightForce = createForceArrow();
    this.act2ArrowRightForce.position.set(halfW, 0, 0);
    this.act2ArrowRightForce.rotation.z = Math.PI;
    this.visuals.straightWireForce.add(this.act2ArrowRightForce);

    // F. 电磁转矩指示弧线 (亮天蓝色弯弧箭头，指示顺时针力矩)
    this.act2TorqueArcRight = new THREE.Mesh(
      new THREE.TorusGeometry(0.55, 0.035, 8, 32, Math.PI * 0.7),
      this.materials.bFieldMat
    );
    this.act2TorqueArcRight.position.set(halfW, 0, 0.8);
    this.act2TorqueArcRight.rotation.set(0, Math.PI / 2, 0);
    this.visuals.straightWireForce.add(this.act2TorqueArcRight);

    this.act2TorqueConeRight = new THREE.Mesh(
      new THREE.ConeGeometry(0.1, 0.22, 12),
      this.materials.bFieldMat
    );
    this.act2TorqueConeRight.position.set(halfW, -0.48, 1.05);
    this.act2TorqueConeRight.rotation.set(-0.8, 0, 0);
    this.visuals.straightWireForce.add(this.act2TorqueConeRight);

    group.add(this.visuals.straightWireForce);

    this.statorGroup.add(group);
  }

  // 4. 幕3：直导线 ➔ U形 ➔ 闭合线圈动态形变模块
  buildMorphingWire() {
    const group = this.parts.morphingWireGroup;

    // 使用 TubeGeometry 动态构建形态演化
    this.morphTubeMesh = new THREE.Mesh(
      new THREE.BufferGeometry(),
      this.materials.copper
    );
    group.add(this.morphTubeMesh);

    this.statorGroup.add(group);
  }

  /**
   * 更新幕3折弯形变几何体 (t: 0.0 -> 1.0)
   */
  updateMorphingGeometry(t) {
    // t=0: 直导线 (-1.35, 0, z)
    // t=0.5: U形展开
    // t=1.0: 完整闭合矩形
    const halfW = 1.35;
    const halfL = 1.8;
    const rightX = -halfW + t * 2 * halfW; // 从 -1.35 展开到 +1.35

    const points = [
      new THREE.Vector3(-halfW, 0, -halfL),
      new THREE.Vector3(-halfW, 0, halfL),
      new THREE.Vector3(rightX, 0, halfL),
      new THREE.Vector3(rightX, 0, -halfL),
      new THREE.Vector3(-halfW, 0, -halfL),
    ];

    const curve = new THREE.CatmullRomCurve3(points, true, 'centripetal', 0.1);
    const tubeGeo = new THREE.TubeGeometry(curve, 64, 0.065, 12, true);

    if (this.morphTubeMesh.geometry) {
      this.morphTubeMesh.geometry.dispose();
    }
    this.morphTubeMesh.geometry = tubeGeo;
  }

  // 5. 不锈钢主转轴
  buildShaft() {
    const group = this.parts.shaft;

    const shaftMesh = new THREE.Mesh(
      new THREE.CylinderGeometry(0.2, 0.2, 8.6, 32),
      this.materials.chrome
    );
    shaftMesh.rotateX(Math.PI / 2);
    shaftMesh.castShadow = true;
    group.add(shaftMesh);

    [-3.5, -2.4, 2.1, 3.5].forEach((z) => {
      const ring = new THREE.Mesh(
        new THREE.CylinderGeometry(0.28, 0.28, 0.1, 24),
        this.materials.chrome
      );
      ring.rotateX(Math.PI / 2);
      ring.position.z = z;
      group.add(ring);
    });

    const pulley = new THREE.Mesh(
      new THREE.CylinderGeometry(0.6, 0.6, 0.3, 32),
      this.materials.bronze
    );
    pulley.rotateX(Math.PI / 2);
    pulley.position.z = 4.1;
    group.add(pulley);

    const setScrew = new THREE.Mesh(
      new THREE.CylinderGeometry(0.06, 0.06, 0.15, 6),
      this.materials.chrome
    );
    setScrew.position.set(0, 0.32, 4.1);
    group.add(setScrew);

    this.rotorGroup.add(group);
  }

  // 6. 转子硅钢叠片铁芯
  buildArmatureCore() {
    const group = this.parts.armatureCore;

    const coreMesh = new THREE.Mesh(
      new THREE.CylinderGeometry(0.85, 0.85, 3.2, 32),
      this.materials.ironCore
    );
    coreMesh.rotateX(Math.PI / 2);
    group.add(coreMesh);

    [0, Math.PI / 2, Math.PI, Math.PI * 1.5].forEach((ang) => {
      const slot = new THREE.Mesh(
        new THREE.BoxGeometry(0.22, 0.35, 3.22),
        this.materials.insulator
      );
      slot.position.set(Math.cos(ang) * 0.75, Math.sin(ang) * 0.75, 0);
      slot.rotation.z = ang;
      group.add(slot);
    });

    this.rotorGroup.add(group);
  }

  // 7. 转子矩形漆包线圈
  buildRotorCoil() {
    const group = this.parts.coil;
    const halfW = 1.35;
    const halfL = 1.8;
    const wireR = 0.065;

    const turns = 3;
    for (let t = 0; t < turns; t++) {
      const w = halfW + (t - 1) * 0.08;
      const l = halfL + (t - 1) * 0.06;

      const path = [
        new THREE.Vector3(-w, 0, -l),
        new THREE.Vector3(w, 0, -l),
        new THREE.Vector3(w, 0, l),
        new THREE.Vector3(-w, 0, l),
      ];

      const curve = new THREE.CatmullRomCurve3(path, true, 'catmullrom', 0.15);
      const tube = new THREE.Mesh(
        new THREE.TubeGeometry(curve, 64, wireR, 12, true),
        this.materials.copper
      );
      tube.castShadow = true;
      group.add(tube);
    }

    // 引出导线 (严谨连接至换向片 A 与 B)
    const lead1Curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-0.3, 0, halfL),
      new THREE.Vector3(-0.35, 0.18, 2.2),
      new THREE.Vector3(-0.25, 0.62, 2.65),
    ]);
    group.add(
      new THREE.Mesh(
        new THREE.TubeGeometry(lead1Curve, 20, 0.05, 8, false),
        this.materials.copper
      )
    );

    const lead2Curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0.3, 0, halfL),
      new THREE.Vector3(0.35, -0.18, 2.2),
      new THREE.Vector3(0.25, -0.62, 2.65),
    ]);
    group.add(
      new THREE.Mesh(
        new THREE.TubeGeometry(lead2Curve, 20, 0.05, 8, false),
        this.materials.copper
      )
    );

    this.rotorGroup.add(group);
  }

  // 8. 双半圆铜环换向器 (重构：绝缘缝隙清晰可辨，两半环完全分离)
  buildCommutator() {
    const group = this.parts.commutator;
    const zCenter = 2.65;
    const commR = 0.62; // 半径扩大，更具观察性
    const commL = 0.85;
    const gapAngle = 0.45; // 25.8° 极大绝缘气隙，清晰暴露出内层套管！

    // 1) 内部黑色绝缘衬套 (露出于绝缘缝隙处，形成黑黄强烈对比)
    const sleeve = new THREE.Mesh(
      new THREE.CylinderGeometry(commR - 0.08, commR - 0.08, commL + 0.25, 32),
      this.materials.insulator
    );
    sleeve.rotateX(Math.PI / 2);
    sleeve.position.z = zCenter;
    group.add(sleeve);

    // 2) 换向片 A (上半圆弧黄铜片)
    const segGeoA = new THREE.CylinderGeometry(
      commR, commR, commL, 32, 1, false,
      gapAngle / 2, Math.PI - gapAngle
    );
    segGeoA.rotateX(Math.PI / 2);
    this.segA = new THREE.Mesh(segGeoA, this.materials.brass);
    this.segA.position.z = zCenter;
    this.segA.castShadow = true;
    group.add(this.segA);

    // 3) 换向片 B (下半圆弧黄铜片)
    const segGeoB = new THREE.CylinderGeometry(
      commR, commR, commL, 32, 1, false,
      Math.PI + gapAngle / 2, Math.PI - gapAngle
    );
    segGeoB.rotateX(Math.PI / 2);
    this.segB = new THREE.Mesh(segGeoB, this.materials.brass);
    this.segB.position.z = zCenter;
    this.segB.castShadow = true;
    group.add(this.segB);

    // 4) 换向片侧面焊接铜凸耳 (线圈引线搭接点)
    const lugA = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.14, 0.18), this.materials.brass);
    lugA.position.set(0, commR, zCenter - commL / 2);
    group.add(lugA);

    const lugB = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.14, 0.18), this.materials.brass);
    lugB.position.set(0, -commR, zCenter - commL / 2);
    group.add(lugB);

    this.rotorGroup.add(group);
  }

  // 9. 固定石墨电刷 (左右固定，贴合两半环)
  buildBrushes() {
    const zCenter = 2.65;
    const contactX = 0.62; // 精确贴合 commR = 0.62

    const createBrush = (isLeft) => {
      const group = isLeft ? this.parts.brushLeft : this.parts.brushRight;
      const xSign = isLeft ? -1 : 1;

      // 石墨碳刷 (方块磨损面贴合)
      const brush = new THREE.Mesh(
        new THREE.BoxGeometry(0.45, 0.36, 0.28),
        this.materials.carbon
      );
      brush.position.set(xSign * (contactX + 0.225), 0, zCenter);
      brush.castShadow = true;
      group.add(brush);

      // 黄铜刷握导套
      const holder = new THREE.Mesh(
        new THREE.BoxGeometry(0.55, 0.44, 0.35),
        this.materials.brass
      );
      holder.position.set(xSign * (contactX + 0.6), 0, zCenter);
      group.add(holder);

      // 螺旋微压弹簧
      for (let i = 0; i < 3; i++) {
        const ring = new THREE.Mesh(
          new THREE.TorusGeometry(0.1, 0.02, 8, 16),
          this.materials.chrome
        );
        ring.position.set(xSign * (contactX + 0.9 + i * 0.08), 0, zCenter);
        ring.rotateY(Math.PI / 2);
        group.add(ring);
      }

      // 绝缘固定立柱
      const post = new THREE.Mesh(
        new THREE.CylinderGeometry(0.14, 0.16, 2.0, 16),
        this.materials.insulator
      );
      post.position.set(xSign * 1.55, -1.0, zCenter);
      group.add(post);

      // 红/黑接线柱端子
      const termMat = isLeft ? this.materials.wireRed : this.materials.wireBlack;
      const term = new THREE.Mesh(
        new THREE.CylinderGeometry(0.16, 0.16, 0.35, 16),
        termMat
      );
      term.position.set(xSign * 1.55, 0.1, zCenter);
      group.add(term);

      const nut = new THREE.Mesh(
        new THREE.CylinderGeometry(0.22, 0.22, 0.1, 6),
        this.materials.brass
      );
      nut.position.set(xSign * 1.55, 0.3, zCenter);
      group.add(nut);

      // 铜绞小辫导线
      const pigtailCurve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(xSign * (contactX + 0.45), 0.15, zCenter),
        new THREE.Vector3(xSign * (contactX + 0.95), 0.28, zCenter),
        new THREE.Vector3(xSign * 1.55, 0.2, zCenter),
      ]);
      group.add(
        new THREE.Mesh(
          new THREE.TubeGeometry(pigtailCurve, 16, 0.025, 8, false),
          this.materials.copper
        )
      );

      this.statorGroup.add(group);
    };

    createBrush(true);  // 左电刷 (正极输入)
    createBrush(false); // 右电刷 (负极回路)
  }

  // 10. 直流稳压电源与回路
  buildPowerSupplyAndWires() {
    const group = this.parts.power;

    const box = new THREE.Mesh(
      new THREE.BoxGeometry(2.4, 1.4, 2.0),
      this.materials.powerBox
    );
    box.position.set(-2.5, -1.1, 4.2);
    box.castShadow = true;
    group.add(box);

    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#020617';
    ctx.fillRect(0, 0, 256, 128);
    ctx.fillStyle = '#10b981';
    ctx.font = 'bold 36px monospace';
    ctx.fillText('12.0 V', 20, 52);
    ctx.fillText(' 2.5 A', 20, 102);

    const screenMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(1.2, 0.5),
      new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(canvas) })
    );
    screenMesh.position.set(-2.5, -1.0, 5.21);
    group.add(screenMesh);

    const postPos = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.18, 16), this.materials.wireRed);
    postPos.rotateX(Math.PI / 2);
    postPos.position.set(-1.8, -1.4, 5.22);
    group.add(postPos);

    const postNeg = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.18, 16), this.materials.wireBlack);
    postNeg.rotateX(Math.PI / 2);
    postNeg.position.set(-1.4, -1.4, 5.22);
    group.add(postNeg);

    const redWireCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-1.8, -1.4, 5.3),
      new THREE.Vector3(-2.2, -1.1, 4.5),
      new THREE.Vector3(-2.1, -0.4, 3.4),
      new THREE.Vector3(-1.55, 0.1, 2.65),
    ]);
    group.add(
      new THREE.Mesh(new THREE.TubeGeometry(redWireCurve, 32, 0.045, 10, false), this.materials.wireRed)
    );

    const blackWireCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-1.4, -1.4, 5.3),
      new THREE.Vector3(-0.5, -1.7, 4.8),
      new THREE.Vector3(0.6, -1.7, 4.0),
      new THREE.Vector3(1.65, -0.6, 3.2),
      new THREE.Vector3(1.55, 0.1, 2.65),
    ]);
    group.add(
      new THREE.Mesh(new THREE.TubeGeometry(blackWireCurve, 40, 0.045, 10, false), this.materials.wireBlack)
    );

    this.statorGroup.add(group);
  }

  // 11. 电磁物理矢量图层
  buildPhysicsVisualizers() {
    // A. 磁感线 (Cyan 亮青色) - 12 根水平连续匀强磁感线
    const bGroup = this.visuals.bField;
    const bYOffsets = [-0.7, -0.2, 0.3, 0.8];
    const bZOffsets = [-0.9, 0, 0.9];

    bZOffsets.forEach((z) => {
      bYOffsets.forEach((y) => {
        const line = new THREE.Mesh(
          new THREE.CylinderGeometry(0.028, 0.028, 5.0, 8),
          this.materials.bFieldMat
        );
        line.rotateZ(-Math.PI / 2);
        line.position.set(0, y, z);
        bGroup.add(line);

        const cone = new THREE.Mesh(
          new THREE.ConeGeometry(0.1, 0.28, 12),
          this.materials.bFieldMat
        );
        cone.rotateZ(-Math.PI / 2);
        cone.position.set(1.0, y, z);
        bGroup.add(cone);
      });
    });
    this.vectorsGroup.add(bGroup);

    // B. 线圈内电流矢量箭头 (Amber 橙黄色)
    const createArrow = (mat) => {
      const g = new THREE.Group();
      const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.55, 8), mat);
      const head = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.25, 12), mat);
      head.position.y = 0.38;
      g.add(stem);
      g.add(head);
      return g;
    };

    [-0.6, 0.6].forEach((z) => {
      const a = createArrow(this.materials.currentMat);
      a.position.set(-1.35, 0.15, z);
      a.rotateX(-Math.PI / 2);
      this.visuals.coilCurrent.add(a);
    });

    [-0.6, 0.6].forEach((z) => {
      const a = createArrow(this.materials.currentMat);
      a.position.set(1.35, 0.15, z);
      a.rotateX(Math.PI / 2);
      this.visuals.coilCurrent.add(a);
    });

    this.rotorGroup.add(this.visuals.coilCurrent);

    // C. 线圈两侧安培力矢量 (Green 翠绿色)
    const createForceVector = () => {
      const g = new THREE.Group();
      const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.2, 12), this.materials.forceMat);
      const head = new THREE.Mesh(new THREE.ConeGeometry(0.15, 0.35, 16), this.materials.forceMat);
      head.position.y = 0.75;
      g.add(stem);
      g.add(head);
      return g;
    };

    this.forceArrowLeft = createForceVector();
    this.forceArrowRight = createForceVector();
    this.visuals.coilForces.add(this.forceArrowLeft);
    this.visuals.coilForces.add(this.forceArrowRight);
    this.vectorsGroup.add(this.visuals.coilForces);

    // D. 顺时针旋转转矩弧线 (Magenta 品红色)
    const arcShape = new THREE.TorusGeometry(1.6, 0.035, 12, 48, Math.PI * 0.85);
    const arcMesh = new THREE.Mesh(arcShape, this.materials.rotArcMat);
    arcMesh.position.z = 2.0;
    this.visuals.rotationArc.add(arcMesh);

    const arcArrowHead = new THREE.Mesh(
      new THREE.ConeGeometry(0.12, 0.3, 12),
      this.materials.rotArcMat
    );
    arcArrowHead.position.set(1.6, 0, 2.0);
    arcArrowHead.rotateZ(-Math.PI * 0.95);
    this.visuals.rotationArc.add(arcArrowHead);

    this.vectorsGroup.add(this.visuals.rotationArc);
  }

  // 12. 3D 文字标签系统 (可开关，用于课堂指引)
  buildLabels() {
    const createBillboard = (text, bgColor = 'rgba(15, 23, 42, 0.85)', textColor = '#38bdf8') => {
      const canvas = document.createElement('canvas');
      canvas.width = 256;
      canvas.height = 72;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = bgColor;
      ctx.roundRect ? ctx.roundRect(4, 4, 248, 64, 12) : ctx.fillRect(4, 4, 248, 64);
      ctx.fill();
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 4;
      ctx.stroke();

      ctx.fillStyle = textColor;
      ctx.font = 'bold 28px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, 128, 36);

      const tex = new THREE.CanvasTexture(canvas);
      const spriteMat = new THREE.SpriteMaterial({ map: tex, depthTest: false });
      const sprite = new THREE.Sprite(spriteMat);
      sprite.scale.set(1.8, 0.5, 1);
      return sprite;
    };

    this.labelSprites = {
      magnetN: createBillboard('🧲 N 极永磁体', '#7f1d1d', '#fca5a5'),
      magnetS: createBillboard('🧲 S 极永磁体', '#1e3a8a', '#93c5fd'),
      coil: createBillboard('🔄 矩形漆包线圈', '#3b2110', '#fdba74'),
      shaft: createBillboard('🔩 镀铬主转轴', '#1e293b', '#e2e8f0'),
      commutator: createBillboard('🟡 半圆换向铜片', '#451a03', '#fde047'),
      brushes: createBillboard('⬛ 固定石墨电刷', '#09090b', '#cbd5e1'),
    };

    this.labelSprites.magnetN.position.set(-2.8, 1.8, 0);
    this.labelSprites.magnetS.position.set(2.8, 1.8, 0);
    this.labelSprites.coil.position.set(0, 1.8, 0);
    this.labelSprites.shaft.position.set(0, 0.8, 3.8);
    this.labelSprites.commutator.position.set(0, 1.3, 2.65);
    this.labelSprites.brushes.position.set(-1.6, 0.8, 2.65);

    Object.values(this.labelSprites).forEach((sp) => this.labelsGroup.add(sp));
  }

  // ---------------- 8 幕核心切换与零件独立隔离控制 ----------------
  applySceneState(sceneIndex) {
    this.currentSceneIndex = sceneIndex;
    this.targetExplodeProgress = 0;
    this.isDampedMode = false;
    this.isMorphing = false;

    // 1. 先完全隐藏所有零件与所有矢量，杜绝残留！
    Object.values(this.parts).forEach((p) => (p.visible = false));
    Object.values(this.visuals).forEach((v) => (v.visible = false));
    Object.values(this.labelSprites).forEach((l) => (l.visible = false));

    this.straightWireTiltAngle = 0;
    if (this.straightWireMeshGroup) {
      this.straightWireMeshGroup.rotation.z = 0;
    }

    // 定子磁极与磁场作为基底在大部分场景均可见
    this.parts.magnetsLeftN.visible = true;
    this.parts.magnetsRightS.visible = true;
    this.visuals.bField.visible = true;

    this.resetPartsAppearance();

    switch (sceneIndex) {
      case 1: // 第 1 幕：纯磁场环境
        this.isRotating = false;
        this.currentAngle = 0;
        this.applyRotation();
        if (this.showLabels) {
          this.labelSprites.magnetN.visible = true;
          this.labelSprites.magnetS.visible = true;
        }
        break;

      case 2: // 第 2 幕：加入通电矩形线框与 J1202A 学生电源实验装置
        this.isRotating = false;
        this.parts.straightWireGroup.visible = true;
        this.isPowerSupplyOn = false; // 初始为断电状态，便于学生先观察电流流向并用左手定则判断受力！
        this.straightWireDirection = 1; // 统一初始为逆时针电流
        this.act2Angle = 0;
        this.act2AngularVelocity = 0;
        this.coilGroupMode = 1;
        this.showArmatureCore = true;
        this.hasCommutator = false;
        this.hasBrushes = false;
        this.act2CurrentA = 2.0;
        this.act2FieldB = 1.0;
        this.act2SpeedScale = 1.0;
        this.act2IsPaused = false;
        this.act2CommutatorContactState = 'single_loop';
        if (this.act2Mode1Group) this.act2Mode1Group.visible = true;
        if (this.act2Mode2Group) this.act2Mode2Group.visible = false;
        if (this.act2Mode3Group) this.act2Mode3Group.visible = false;
        if (this.act2CommutatorGroup) this.act2CommutatorGroup.visible = false;
        if (this.act2BrushesGroup) this.act2BrushesGroup.visible = false;
        if (this.act2ClipLoopLeft) this.act2ClipLoopLeft.visible = true;
        if (this.act2ClipLoopRight) this.act2ClipLoopRight.visible = true;
        this.updateArmatureCoreVisibility();
        if (this.straightWireMeshGroup) {
          this.straightWireMeshGroup.rotation.z = 0;
        }
        this.togglePowerSupply(false);
        break;

      case 3: // 第 3 幕：直导线弯折演化形成矩形线圈
        this.startWireMorphingAnimation();
        break;

      case 4: // 第 4 幕：线圈为何无法持续转动？(阻尼停转)
        this.parts.shaft.visible = true;
        this.parts.coil.visible = true;
        this.visuals.coilCurrent.visible = true;
        this.visuals.coilForces.visible = true;
        this.startDampedOscillation();
        break;

      case 5: // 第 5 幕：引入换向器和电刷 (特写)
        this.parts.shaft.visible = true;
        this.parts.coil.visible = true;
        this.parts.commutator.visible = true;
        this.parts.brushLeft.visible = true;
        this.parts.brushRight.visible = true;
        this.parts.power.visible = true;
        this.visuals.coilCurrent.visible = true;
        this.visuals.coilForces.visible = true;
        this.isRotating = false;
        this.currentAngle = 0;
        this.applyRotation();
        // 高亮换向片
        this.materials.brass.emissive = new THREE.Color(0xf59e0b);
        this.materials.brass.emissiveIntensity = 0.55;
        if (this.showLabels) {
          this.labelSprites.commutator.visible = true;
          this.labelSprites.brushes.visible = true;
        }
        break;

      case 6: // 第 6 幕：演示换向过程 (慢放)
        this.parts.shaft.visible = true;
        this.parts.coil.visible = true;
        this.parts.commutator.visible = true;
        this.parts.brushLeft.visible = true;
        this.parts.brushRight.visible = true;
        this.parts.power.visible = true;
        this.visuals.coilCurrent.visible = true;
        this.visuals.coilForces.visible = true;
        this.visuals.rotationArc.visible = true;
        this.isRotating = true;
        this.rotationSpeed = 0.35; // 慢放
        break;

      case 7: // 第 7 幕：完整电动机持续运转
        Object.values(this.parts).forEach((p) => (p.visible = true));
        this.parts.straightWireGroup.visible = false;
        this.parts.morphingWireGroup.visible = false;
        this.visuals.coilCurrent.visible = true;
        this.visuals.coilForces.visible = true;
        this.visuals.rotationArc.visible = true;
        this.isRotating = true;
        this.rotationSpeed = 1.0;
        break;

      case 8: // 第 8 幕：电动机拆解与自由探索
        Object.values(this.parts).forEach((p) => (p.visible = true));
        this.parts.straightWireGroup.visible = false;
        this.parts.morphingWireGroup.visible = false;
        this.visuals.coilCurrent.visible = true;
        this.visuals.coilForces.visible = true;
        this.visuals.rotationArc.visible = true;
        this.isRotating = true;
        break;
    }
  }

  // 幕2：切换电源开关状态 (通电 / 断电)
  togglePowerSupply(forceState) {
    this.isPowerSupplyOn = forceState !== undefined ? forceState : !this.isPowerSupplyOn;

    // 更新指示灯发光与开关翻折姿态
    if (this.psLedSwitch && this.psRockerMesh) {
      if (this.isPowerSupplyOn) {
        this.materials.ledGreen.emissiveIntensity = 0.85;
        this.psRockerMesh.rotation.x = 0.25; // 开启状态 'I'
      } else {
        this.materials.ledGreen.emissiveIntensity = 0.0;
        this.psRockerMesh.rotation.x = -0.25; // 关闭状态 'O'
      }
    }

    // 电流流动方向箭头在断电与通电时均保持绘制与清晰显示！
    this.visuals.straightWireCurrent.visible = true;
    if (this.straightWireLoopCurrent) {
      this.straightWireLoopCurrent.visible = true;
    }

    if (!this.isPowerSupplyOn) {
      this.visuals.straightWireForce.visible = false; // 断电时无安培力
    } else {
      this.visuals.straightWireForce.visible = true;
      if (this.currentSceneIndex === 2) {
        this.checkAct2Startup();
      }
    }
    this.updateStraightWirePhysics();
  }

  // 幕2：切换矩形线框电流流向 (+1: 逆时针供电, -1: 顺时针供电)
  toggleStraightWireCurrent() {
    this.straightWireDirection *= -1;
    this.updateStraightWirePhysics();
  }

  updateStraightWirePhysics() {
    const dir = this.straightWireDirection; // 1: 逆时针供电, -1: 顺时针供电
    const upVec = new THREE.Vector3(0, 1, 0);

    // 1. 右侧有效边上的电流箭头 (统一逆时针：沿导线指向 -Z)
    const rightDir = dir === 1 ? new THREE.Vector3(0, 0, -1) : new THREE.Vector3(0, 0, 1);
    if (this.act2ArrowRightCurrent1) this.act2ArrowRightCurrent1.quaternion.setFromUnitVectors(upVec, rightDir);
    if (this.act2ArrowRightCurrent2) this.act2ArrowRightCurrent2.quaternion.setFromUnitVectors(upVec, rightDir);

    // 2. 后横梁上的电流箭头 (统一逆时针：沿导线指向 -X)
    if (this.act2ArrowBackCurrent) {
      const arrowDir = dir === 1 ? new THREE.Vector3(-1, 0, 0) : new THREE.Vector3(1, 0, 0);
      this.act2ArrowBackCurrent.quaternion.setFromUnitVectors(upVec, arrowDir);
    }

    // 3. 左侧有效边上的电流箭头 (统一逆时针：沿导线指向 +Z)
    const leftDir = dir === 1 ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(0, 0, -1);
    if (this.act2ArrowLeftCurrent1) this.act2ArrowLeftCurrent1.quaternion.setFromUnitVectors(upVec, leftDir);
    if (this.act2ArrowLeftCurrent2) this.act2ArrowLeftCurrent2.quaternion.setFromUnitVectors(upVec, leftDir);

    // 4. 安培力矢量方向 (左手定则：逆时针时左侧向上、右侧向下)
    if (this.act2ArrowLeftForce) {
      this.act2ArrowLeftForce.rotation.z = dir === 1 ? 0 : Math.PI;
    }
    if (this.act2ArrowRightForce) {
      this.act2ArrowRightForce.rotation.z = dir === 1 ? Math.PI : 0;
    }

    // 5. 转矩指示弧线
    if (this.act2TorqueConeRight) {
      this.act2TorqueConeRight.rotation.x = dir === 1 ? -0.8 : 2.3;
    }
  }

  // 幕2：通电矩形线框动力学仿真（支持“单组线圈 / 双组正交 / 多组密集”电枢与换向器升级）
  updateAct2Physics(dt) {
    if (this.currentSceneIndex !== 2) return;

    const dtClamped = Math.min(dt, 0.05);
    const dir = this.straightWireDirection; // +1: 逆时针供电, -1: 顺时针供电
    const isMotorReady = this.coilGroupMode >= 2 || (this.hasCommutator && this.hasBrushes);

    const halfW = 1.15;
    const cosA = Math.cos(this.act2Angle);
    const sinA = Math.sin(this.act2Angle);
    let rightX = halfW * cosA;
    let rightY = -halfW * sinA;
    let leftX = -halfW * cosA;
    let leftY = halfW * sinA;
    let torqueFactor = 0;

    if (!isMotorReady && this.coilGroupMode === 1) {
      // 模式 A：单矩形线框（未装齐换向器与电刷），通电在平衡位置(90°)阻尼平衡停转
      this.act2CommutatorContactState = 'single_loop';
      this.activeCoilIndex = 1;

      if (this.isPowerSupplyOn) {
        const targetEq = dir * (Math.PI / 2);
        const forceScale = (this.act2CurrentA / 2.0) * (this.act2FieldB / 1.0);
        // 电磁力矩：水平(theta=0)最大，垂直(theta=90°)力臂归零
        const tauEm = 28.0 * forceScale * Math.cos(this.act2Angle) * dir;
        const tauWire = -6.5 * (this.act2Angle - targetEq);
        const tauDamping = -4.8 * this.act2AngularVelocity;

        const alpha = tauEm + tauWire + tauDamping;
        this.act2AngularVelocity += alpha * dtClamped;
        this.act2Angle += this.act2AngularVelocity * dtClamped;
      } else {
        const tauGravity = -16.0 * Math.sin(this.act2Angle);
        const tauDamping = -4.2 * this.act2AngularVelocity;
        const alpha = tauGravity + tauDamping;
        this.act2AngularVelocity += alpha * dtClamped;
        this.act2Angle += this.act2AngularVelocity * dtClamped;
      }
    } else {
      // 模式 B：具备换向器与电刷系统，可实现持续旋转！
      if (this.coilGroupMode === 1) {
        // --- 组数 1：单组线圈 (2 槽半圆片，参考图 0) ---
        const normA = ((this.act2Angle % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
        const gapHalfRad = (9 * Math.PI) / 180;
        const isGap1 = Math.abs(normA - Math.PI / 2) < gapHalfRad;
        const isGap2 = Math.abs(normA - 1.5 * Math.PI) < gapHalfRad;

        if (isGap1 || isGap2) {
          this.act2CommutatorContactState = 'neutral';
        } else if (normA > Math.PI / 2 && normA < 1.5 * Math.PI) {
          this.act2CommutatorContactState = 'reverse';
        } else {
          this.act2CommutatorContactState = 'forward';
        }
        this.activeCoilIndex = 1;
        torqueFactor = Math.abs(cosA);

        if (!this.isPowerSupplyOn) {
          this.act2AngularVelocity *= Math.max(0, 1.0 - 2.2 * dtClamped);
          this.act2Angle += this.act2AngularVelocity * dtClamped;
        } else if (this.act2IsPaused) {
          this.act2AngularVelocity = 0;
        } else {
          const targetW =
            dir *
            3.8 *
            (this.act2CurrentA / 2.0) *
            (this.act2FieldB / 1.0) *
            this.act2SpeedScale;

          // 智能死点启动冲量
          if ((isGap1 || isGap2) && Math.abs(this.act2AngularVelocity) < 0.3) {
            this.act2AngularVelocity = targetW * 0.75;
            this.act2Angle += dir * (gapHalfRad + 0.04);
          }

          if (this.act2CommutatorContactState === 'neutral') {
            const minCoastW = targetW * 0.75;
            if (Math.abs(this.act2AngularVelocity) < Math.abs(minCoastW)) {
              this.act2AngularVelocity = minCoastW;
            }
          } else {
            const torqueCoeff = 0.85 + 0.3 * torqueFactor;
            const instantW = targetW * torqueCoeff;
            this.act2AngularVelocity += (instantW - this.act2AngularVelocity) * Math.min(1.0, 8.5 * dtClamped);
          }
          this.act2Angle += this.act2AngularVelocity * dtClamped;
        }
      } else if (this.coilGroupMode === 2) {
        // --- 组数 2：双组正交线圈 (4 槽换向片，参考图 1) ---
        // 线圈 A (夹角 0°)，线圈 B (夹角 90°)
        const isCoilAActive = Math.abs(cosA) >= Math.abs(sinA);

        if (isCoilAActive) {
          this.activeCoilIndex = 1; // 线圈 A 主导
          torqueFactor = Math.abs(cosA);
          if (this.act2Coil2A) this.act2Coil2A.material = this.materials.coilActiveMat;
          if (this.act2Coil2B) this.act2Coil2B.material = this.materials.coilDimMat;
          rightX = halfW * cosA;
          rightY = -halfW * sinA;
          leftX = -rightX;
          leftY = -rightY;
        } else {
          this.activeCoilIndex = 2; // 线圈 B 主导
          torqueFactor = Math.abs(sinA);
          if (this.act2Coil2B) this.act2Coil2B.material = this.materials.coilActiveMat;
          if (this.act2Coil2A) this.act2Coil2A.material = this.materials.coilDimMat;
          // 线圈 B 正交于 A，其两端在世界系下的几何位置
          rightX = -halfW * sinA;
          rightY = -halfW * cosA;
          leftX = -rightX;
          leftY = -rightY;
        }

        this.act2CommutatorContactState = isCoilAActive
          ? cosA >= 0 ? 'forward' : 'reverse'
          : sinA >= 0 ? 'forward' : 'reverse';

        if (!this.isPowerSupplyOn) {
          this.act2AngularVelocity *= Math.max(0, 1.0 - 2.2 * dtClamped);
          this.act2Angle += this.act2AngularVelocity * dtClamped;
        } else if (this.act2IsPaused) {
          this.act2AngularVelocity = 0;
        } else {
          const targetW =
            dir *
            4.5 *
            (this.act2CurrentA / 2.0) *
            (this.act2FieldB / 1.0) *
            this.act2SpeedScale;
          // 双组线圈力矩始终在 0.707 ~ 1.0 之间脉动，彻底无死点
          const torqueCoeff = 0.88 + 0.16 * torqueFactor;
          const instantW = targetW * torqueCoeff;
          this.act2AngularVelocity += (instantW - this.act2AngularVelocity) * Math.min(1.0, 9.0 * dtClamped);
          this.act2Angle += this.act2AngularVelocity * dtClamped;
        }
      } else {
        // --- 组数 3：多组密集电枢 (16 槽换向器，参考图 2) ---
        // 8 组线圈沿圆周径向均匀分布，无论转到任何角度均有最接近水平面的线圈接入电刷
        const normPi = ((this.act2Angle % Math.PI) + Math.PI) % Math.PI;
        const kActive = Math.round(normPi / (Math.PI / 8)) % 8;
        this.activeCoilIndex = kActive + 1;

        if (this.act2Mode3Coils) {
          this.act2Mode3Coils.forEach((cMesh, idx) => {
            cMesh.material = idx === kActive ? this.materials.coilActiveMat : this.materials.coilDimMat;
          });
        }

        const phiActive = (kActive * Math.PI) / 8;
        const activeAngle = this.act2Angle - phiActive;
        const deltaOffset = Math.abs(normPi - phiActive);
        torqueFactor = Math.cos(deltaOffset); // 0.9808 ~ 1.0 (< 2% 转矩波动率！)

        rightX = halfW * Math.cos(activeAngle);
        rightY = -halfW * Math.sin(activeAngle);
        leftX = -rightX;
        leftY = -rightY;

        this.act2CommutatorContactState = 'dense_commutated';

        if (!this.isPowerSupplyOn) {
          this.act2AngularVelocity *= Math.max(0, 1.0 - 2.2 * dtClamped);
          this.act2Angle += this.act2AngularVelocity * dtClamped;
        } else if (this.act2IsPaused) {
          this.act2AngularVelocity = 0;
        } else {
          const targetW =
            dir *
            5.2 *
            (this.act2CurrentA / 2.0) *
            (this.act2FieldB / 1.0) *
            this.act2SpeedScale;
          const torqueCoeff = 0.97 + 0.03 * torqueFactor;
          const instantW = targetW * torqueCoeff;
          this.act2AngularVelocity += (instantW - this.act2AngularVelocity) * Math.min(1.0, 10.0 * dtClamped);
          this.act2Angle += this.act2AngularVelocity * dtClamped;
        }
      }
    }

    // 1. 同步旋转线框本体组 (左手定则物理纠正：逆时针供电时左抬右落，从前方看为顺时针旋转，对应 rotation.z = -act2Angle)
    if (this.straightWireMeshGroup) {
      this.straightWireMeshGroup.rotation.z = -this.act2Angle;
    }

    // 2. 动态更新安培力箭头位置与流向矢量
    if (this.act2ArrowLeftForce) {
      this.act2ArrowLeftForce.position.set(leftX, leftY, 0);
    }
    if (this.act2ArrowRightForce) {
      this.act2ArrowRightForce.position.set(rightX, rightY, 0);
    }

    const upVec = new THREE.Vector3(0, 1, 0);

    if (isMotorReady && this.isPowerSupplyOn) {
      if (this.act2CommutatorContactState === 'neutral' && this.coilGroupMode === 1) {
        // 单组中性面绝缘间隙：线框断电瞬态，电流与安培力归零
        if (this.straightWireLoopCurrent) this.straightWireLoopCurrent.visible = false;
        this.visuals.straightWireForce.visible = false;
        if (this.act2TorqueArcRight) this.act2TorqueArcRight.visible = false;
        if (this.act2TorqueConeRight) this.act2TorqueConeRight.visible = false;
      } else {
        if (this.straightWireLoopCurrent) {
          this.straightWireLoopCurrent.visible = this.coilGroupMode === 1;
        }
        this.visuals.straightWireForce.visible = true;

        // 安培力严格遵循左手定则：
        // 磁场向右 (+X)。
        // 无论何种线圈模式，只要处于左侧半区 (X <= 0) 导线电流均向前(+Z)受力向上(+Y, rotation.z=0)；
        // 处于右侧半区 (X >= 0) 导线电流向后(-Z)受力向下(-Y, rotation.z=PI)。
        if (this.act2ArrowLeftForce) {
          this.act2ArrowLeftForce.rotation.z = dir === 1 ? 0 : Math.PI;
        }
        if (this.act2ArrowRightForce) {
          this.act2ArrowRightForce.rotation.z = dir === 1 ? Math.PI : 0;
        }

        // 动态缩放安培力箭头大小 (双组与多组有更多电枢绕组有效导线，总受力稍增)
        const multiBonus = this.coilGroupMode === 1 ? 1.0 : this.coilGroupMode === 2 ? 1.15 : 1.28;
        const fScale = Math.max(0.4, Math.min(2.2, (this.act2CurrentA * this.act2FieldB * multiBonus) / 2.0));
        if (this.act2ArrowLeftForce) this.act2ArrowLeftForce.scale.set(1, fScale, 1);
        if (this.act2ArrowRightForce) this.act2ArrowRightForce.scale.set(1, fScale, 1);

        // 持续旋转转矩指示弧线
        if (this.act2TorqueArcRight && this.act2TorqueConeRight) {
          this.act2TorqueArcRight.position.set(rightX, rightY, 0.8);
          this.act2TorqueConeRight.position.set(rightX, rightY - 0.48 * dir, 1.05);
          this.act2TorqueArcRight.scale.set(fScale, fScale, fScale);
          this.act2TorqueConeRight.scale.set(fScale, fScale, fScale);
          this.act2TorqueArcRight.visible = true;
          this.act2TorqueConeRight.visible = true;
        }
      }
    } else {
      // 模式 A 或断电：默认保持线框电流箭头可见以供判断，安培力根据开关通断显隐
      if (this.straightWireLoopCurrent) {
        this.straightWireLoopCurrent.visible = this.coilGroupMode === 1;
      }
      this.visuals.straightWireForce.visible = this.isPowerSupplyOn;

      const fScale = Math.max(0.4, Math.min(2.2, (this.act2CurrentA * this.act2FieldB) / 2.0));
      if (this.act2ArrowLeftForce) {
        this.act2ArrowLeftForce.scale.set(1, fScale, 1);
        this.act2ArrowLeftForce.rotation.z = dir === 1 ? 0 : Math.PI;
      }
      if (this.act2ArrowRightForce) {
        this.act2ArrowRightForce.scale.set(1, fScale, 1);
        this.act2ArrowRightForce.rotation.z = dir === 1 ? Math.PI : 0;
      }

      const torqueMag = Math.max(0, Math.cos(this.act2Angle));
      if (this.act2TorqueArcRight && this.act2TorqueConeRight) {
        this.act2TorqueArcRight.position.set(rightX, rightY, 0.8);
        this.act2TorqueConeRight.position.set(
          rightX,
          rightY - 0.48 * (dir === 1 ? 1 : -1),
          1.05
        );
        const s = torqueMag * (this.isPowerSupplyOn ? fScale : 0);
        this.act2TorqueArcRight.scale.set(s, s, s);
        this.act2TorqueConeRight.scale.set(s, s, s);
        this.act2TorqueArcRight.visible = s > 0.05;
        this.act2TorqueConeRight.visible = s > 0.05;
      }
    }

    // 3. 动态更新柔性接线端点：
    const pRightWorld = (this.hasBrushes || this.coilGroupMode >= 2)
      ? new THREE.Vector3(1.48, 0, 2.45)
      : new THREE.Vector3(rightX, rightY, 2.45 - 0.1);

    const pLeftWorld = (this.hasBrushes || this.coilGroupMode >= 2)
      ? new THREE.Vector3(-1.48, 0, 2.45)
      : new THREE.Vector3(leftX, leftY, 2.45 - 0.1);

    if (this.wireRedPoints && this.wireRedCurve && this.wireRedMesh) {
      this.wireRedPoints[this.wireRedPoints.length - 1].copy(pRightWorld);
      this.wireRedPoints[this.wireRedPoints.length - 2].set(
        0.6 + pRightWorld.x * 0.2,
        0.35 + pRightWorld.y * 0.2,
        3.7
      );
      this.wireRedMesh.geometry.dispose();
      this.wireRedMesh.geometry = new THREE.TubeGeometry(this.wireRedCurve, 50, 0.042, 8, false);
    }

    if (this.wireGreenPoints && this.wireGreenCurve && this.wireGreenMesh) {
      this.wireGreenPoints[0].copy(pLeftWorld);
      this.wireGreenPoints[1].set(
        -1.2 + pLeftWorld.x * 0.2,
        0.35 + pLeftWorld.y * 0.2,
        3.7
      );
      this.wireGreenMesh.geometry.dispose();
      this.wireGreenMesh.geometry = new THREE.TubeGeometry(this.wireGreenCurve, 50, 0.042, 8, false);
    }

    // 4. 动态更新柔性接线上随线弯曲流动的电流箭头 (断电与通电时均完整跟随导线形态更新)
    if (this.wireRedCurve) {
      if (this.act2ArrowLeadIn1) {
        const pt = this.wireRedCurve.getPointAt(0.32);
        const tan = this.wireRedCurve.getTangentAt(0.32).normalize();
        this.act2ArrowLeadIn1.position.copy(pt);
        const arrowDir = dir === 1 ? tan : tan.clone().negate();
        this.act2ArrowLeadIn1.quaternion.setFromUnitVectors(upVec, arrowDir);
      }
      if (this.act2ArrowLeadIn2) {
        const pt = this.wireRedCurve.getPointAt(0.72);
        const tan = this.wireRedCurve.getTangentAt(0.72).normalize();
        this.act2ArrowLeadIn2.position.copy(pt);
        const arrowDir = dir === 1 ? tan : tan.clone().negate();
        this.act2ArrowLeadIn2.quaternion.setFromUnitVectors(upVec, arrowDir);
      }
    }

    if (this.wireGreenCurve) {
      if (this.act2ArrowLeadOut1) {
        const pt = this.wireGreenCurve.getPointAt(0.28);
        const tan = this.wireGreenCurve.getTangentAt(0.28).normalize();
        this.act2ArrowLeadOut1.position.copy(pt);
        const arrowDir = dir === 1 ? tan : tan.clone().negate();
        this.act2ArrowLeadOut1.quaternion.setFromUnitVectors(upVec, arrowDir);
      }
      if (this.act2ArrowLeadOut2) {
        const pt = this.wireGreenCurve.getPointAt(0.68);
        const tan = this.wireGreenCurve.getTangentAt(0.68).normalize();
        this.act2ArrowLeadOut2.position.copy(pt);
        const arrowDir = dir === 1 ? tan : tan.clone().negate();
        this.act2ArrowLeadOut2.quaternion.setFromUnitVectors(upVec, arrowDir);
      }
    }
  }

  // 幕2：线圈与换向片组数升级切换 (1: 单组线圈, 2: 双组正交线圈, 3: 多组密集电枢)
  setCoilGroupMode(mode) {
    this.coilGroupMode = Number(mode) || 1;

    if (this.act2Mode1Group) this.act2Mode1Group.visible = this.coilGroupMode === 1;
    if (this.act2Mode2Group) this.act2Mode2Group.visible = this.coilGroupMode === 2;
    if (this.act2Mode3Group) this.act2Mode3Group.visible = this.coilGroupMode === 3;

    // 双组与多组结构默认具备内置换向器与固定电刷系统
    if (this.coilGroupMode >= 2) {
      if (this.act2BrushesGroup) this.act2BrushesGroup.visible = true;
      if (this.act2ClipLoopLeft) this.act2ClipLoopLeft.visible = false;
      if (this.act2ClipLoopRight) this.act2ClipLoopRight.visible = false;
    } else {
      if (this.act2CommutatorGroup) this.act2CommutatorGroup.visible = this.hasCommutator;
      if (this.act2BrushesGroup) this.act2BrushesGroup.visible = this.hasBrushes;
      if (this.act2ClipLoopLeft) this.act2ClipLoopLeft.visible = !this.hasBrushes;
      if (this.act2ClipLoopRight) this.act2ClipLoopRight.visible = !this.hasBrushes;
    }

    this.updateArmatureCoreVisibility();
    this.checkAct2Startup();
  }

  // 转子硅钢铁芯显隐控制
  setArmatureCoreVisibility(visible) {
    this.showArmatureCore = !!visible;
    this.updateArmatureCoreVisibility();
  }

  updateArmatureCoreVisibility() {
    if (this.act2ArmatureCore2) {
      this.act2ArmatureCore2.visible = this.showArmatureCore && this.coilGroupMode === 2;
    }
    if (this.act2ArmatureCore3) {
      this.act2ArmatureCore3.visible = this.showArmatureCore && this.coilGroupMode === 3;
    }
  }

  // 幕2：装配控制方法
  setAct2Commutator(installed) {
    this.hasCommutator = !!installed;
    if (this.act2CommutatorGroup) {
      this.act2CommutatorGroup.visible = this.hasCommutator;
    }
    this.checkAct2Startup();
  }

  setAct2Brushes(installed) {
    this.hasBrushes = !!installed;
    if (this.act2BrushesGroup) {
      this.act2BrushesGroup.visible = this.hasBrushes;
    }
    if (this.act2ClipLoopLeft) this.act2ClipLoopLeft.visible = !this.hasBrushes;
    if (this.act2ClipLoopRight) this.act2ClipLoopRight.visible = !this.hasBrushes;
    this.checkAct2Startup();
  }

  checkAct2Startup() {
    if (this.currentSceneIndex !== 2) return;
    const isReady = this.coilGroupMode >= 2 || (this.hasCommutator && this.hasBrushes);
    if (isReady && this.isPowerSupplyOn) {
      const normA = ((this.act2Angle % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
      const gapHalfRad = (9 * Math.PI) / 180;
      if (Math.abs(normA - Math.PI / 2) < gapHalfRad + 0.08 || Math.abs(normA - 1.5 * Math.PI) < gapHalfRad + 0.08) {
        this.act2Angle += this.straightWireDirection * (gapHalfRad + 0.05);
      }
      if (Math.abs(this.act2AngularVelocity) < 0.3) {
        this.act2AngularVelocity =
          this.straightWireDirection *
          2.6 *
          (this.act2CurrentA / 2.0) *
          (this.act2FieldB / 1.0) *
          this.act2SpeedScale;
      }
    }
  }

  setAct2Current(currentA) {
    this.act2CurrentA = Math.max(0.5, Math.min(4.0, Number(currentA) || 2.0));
    if (this.psBigKnobGroup) {
      const t = (this.act2CurrentA - 0.5) / 3.5;
      this.psBigKnobGroup.rotation.z = -0.9 + t * 2.8;
    }
  }

  setAct2Field(fieldB) {
    this.act2FieldB = Math.max(0.5, Math.min(2.0, Number(fieldB) || 1.0));
    if (this.materials.bFieldMat) {
      const brightness = 0.4 + 0.6 * (this.act2FieldB / 1.0);
      this.materials.bFieldMat.opacity = Math.min(1.0, brightness);
      this.materials.bFieldMat.transparent = true;
    }
    if (this.visuals.bField) {
      const s = 0.8 + 0.3 * (this.act2FieldB / 1.0);
      this.visuals.bField.scale.set(1, s, s);
    }
  }

  setAct2SpeedScale(speedScale) {
    this.act2SpeedScale = Math.max(0.2, Math.min(2.0, Number(speedScale) || 1.0));
  }

  toggleAct2Pause() {
    this.act2IsPaused = !this.act2IsPaused;
    return this.act2IsPaused;
  }

  stepAct2Angle(degStep = 15) {
    const radStep = ((degStep * Math.PI) / 180) * this.straightWireDirection;
    this.act2Angle += radStep;
    this.updateAct2Physics(0);
  }

  // 幕3：启动直导线 ➔ U形 ➔ 闭合线圈演化动画
  startWireMorphingAnimation() {
    this.parts.morphingWireGroup.visible = true;
    this.parts.coil.visible = false;
    this.parts.shaft.visible = false;
    this.visuals.coilCurrent.visible = false;
    this.visuals.coilForces.visible = false;
    this.visuals.rotationArc.visible = false;

    this.isMorphing = true;
    this.morphProgress = 0;
    this.isRotating = false;
    this.currentAngle = 0;
    this.applyRotation();
  }

  // 幕4：启动无换向器阻尼摆动
  startDampedOscillation() {
    this.isDampedMode = true;
    this.isRotating = false;
    this.currentAngle = 0.05; // 接近水平启动
    this.angularVelocity = 3.6; // 赋予初始冲量
  }

  // ---------------- 动力学与物理模拟 ----------------
  update(deltaTime = 0.016) {
    // 1. 幕2：通电矩形线框 90° 旋转与阻尼物理动力学模拟
    if (this.currentSceneIndex === 2) {
      this.updateAct2Physics(deltaTime);
    }

    // 2. 幕3：直导线演变线圈插值动画
    if (this.isMorphing) {
      this.morphProgress += deltaTime * 0.45; // 约 2.2 秒完成演化
      if (this.morphProgress >= 1.0) {
        this.morphProgress = 1.0;
        this.isMorphing = false;
        // 形态演化完成，显现正式线圈与转轴，启动旋转
        this.parts.morphingWireGroup.visible = false;
        this.parts.coil.visible = true;
        this.parts.shaft.visible = true;
        this.visuals.coilCurrent.visible = true;
        this.visuals.coilForces.visible = true;
        this.visuals.rotationArc.visible = true;
        this.isRotating = true;
        this.rotationSpeed = 0.8;
      }
      this.updateMorphingGeometry(this.morphProgress);
    }

    // 3. 幕4：无换向器真实阻尼物理积分
    if (this.isDampedMode) {
      const kTorque = 9.8;
      const cDamp = 1.45;
      const torque = -kTorque * Math.cos(this.currentAngle);
      const accel = torque - cDamp * this.angularVelocity;

      this.angularVelocity += accel * deltaTime;
      this.currentAngle += this.angularVelocity * deltaTime;

      this.applyRotationWithoutCommutator();
    } else if (this.isRotating && this.rotationSpeed > 0) {
      // 具备换向器的单向顺时针转动驱动
      const omega = 1.8 * this.rotationSpeed;
      this.currentAngle = (this.currentAngle - omega * deltaTime) % (Math.PI * 2);
      if (this.currentAngle < 0) this.currentAngle += Math.PI * 2;
      this.applyRotation();
    }

    // 4. 爆炸拆解平滑插值动画
    if (Math.abs(this.currentExplodeProgress - this.targetExplodeProgress) > 0.001) {
      this.currentExplodeProgress += (this.targetExplodeProgress - this.currentExplodeProgress) * 0.08;
      this.applyPartTransforms(this.currentExplodeProgress);
    }
  }

  // 幕4：无换向器的受力与反转力矩
  applyRotationWithoutCommutator() {
    this.rotorGroup.rotation.z = this.currentAngle;
    const rad = this.currentAngle;
    const halfW = 1.35;

    const x1 = -halfW * Math.cos(rad);
    const y1 = -halfW * Math.sin(rad);
    const x2 = halfW * Math.cos(rad);
    const y2 = halfW * Math.sin(rad);

    // 边1始终向上(+Y)，边2始终向下(-Y)
    this.forceArrowLeft.position.set(x1, y1, 0);
    this.forceArrowLeft.rotation.z = 0;

    this.forceArrowRight.position.set(x2, y2, 0);
    this.forceArrowRight.rotation.z = Math.PI;

    this.currentFlowState = 'no_commutator_oscillating';
  }

  // 正常具备换向器的受力与换流计算
  applyRotation() {
    this.rotorGroup.rotation.z = this.currentAngle;
    const deg = (this.currentAngle * (180 / Math.PI)) % 360;

    const gapThreshold = 7.0;
    const isGap1 = Math.abs(deg - 90) < gapThreshold;
    const isGap2 = Math.abs(deg - 270) < gapThreshold;

    let currentMagnitude = 1.0;

    if (isGap1 || isGap2) {
      this.currentFlowState = 'neutral';
      currentMagnitude = 0;
    } else if (deg > 90 && deg < 270) {
      this.currentFlowState = 'reverse';
    } else {
      this.currentFlowState = 'forward';
    }

    this.updatePhysicsVectors(deg, currentMagnitude);
  }

  updatePhysicsVectors(deg, currentMag) {
    // 只有在真正包含线圈的场景 (3, 4, 5, 6, 7, 8) 且线圈可见时才渲染线圈电流与安培力！
    // 绝不让线圈电流箭头泄露到第 1 幕（纯磁场）或第 2 幕（直导线）！
    const shouldShowCoilVectors = [3, 4, 5, 6, 7, 8].includes(this.currentSceneIndex) && this.parts.coil.visible;

    if (!shouldShowCoilVectors || currentMag === 0) {
      this.forceArrowLeft.visible = false;
      this.forceArrowRight.visible = false;
      this.visuals.coilCurrent.visible = false;
      return;
    }

    this.forceArrowLeft.visible = true;
    this.forceArrowRight.visible = true;
    this.visuals.coilCurrent.visible = true;

    const rad = this.currentAngle;
    const halfW = 1.35;

    const x1 = -halfW * Math.cos(rad);
    const y1 = -halfW * Math.sin(rad);
    const x2 = halfW * Math.cos(rad);
    const y2 = halfW * Math.sin(rad);

    const forceMag = Math.abs(Math.cos(rad)) * currentMag;

      // 换向器使位于左半空间(X < 0)的边受力始终朝上(+Y)，右半空间(X > 0)始终朝下(-Y)
      if (x1 < 0) {
        this.forceArrowLeft.position.set(x1, y1, 0);
        this.forceArrowLeft.rotation.z = 0;
        this.forceArrowLeft.scale.set(1, Math.max(0.1, forceMag), 1);

        this.forceArrowRight.position.set(x2, y2, 0);
        this.forceArrowRight.rotation.z = Math.PI;
        this.forceArrowRight.scale.set(1, Math.max(0.1, forceMag), 1);
      } else {
        this.forceArrowRight.position.set(x2, y2, 0);
        this.forceArrowRight.rotation.z = 0;
        this.forceArrowRight.scale.set(1, Math.max(0.1, forceMag), 1);

        this.forceArrowLeft.position.set(x1, y1, 0);
        this.forceArrowLeft.rotation.z = Math.PI;
        this.forceArrowLeft.scale.set(1, Math.max(0.1, forceMag), 1);
      }
  }

  // ---------------- 观察模式控制 (幕8专属) ----------------
  setObservationMode(mode) {
    this.resetPartsAppearance();
    switch (mode) {
      case 'normal':
        this.targetExplodeProgress = 0;
        break;
      case 'xray':
        this.targetExplodeProgress = 0;
        [this.materials.magnetN, this.materials.magnetS, this.materials.baseChassis].forEach((m) => {
          m.transparent = true;
          m.opacity = 0.25;
        });
        break;
      case 'highlight':
        this.targetExplodeProgress = 0;
        this.materials.copper.emissive = new THREE.Color(0xd97706);
        this.materials.copper.emissiveIntensity = 0.45;
        this.materials.brass.emissive = new THREE.Color(0xf59e0b);
        this.materials.brass.emissiveIntensity = 0.45;
        break;
      case 'coil_only':
        this.targetExplodeProgress = 0;
        this.parts.base.visible = false;
        this.parts.magnetsLeftN.visible = false;
        this.parts.magnetsRightS.visible = false;
        this.parts.brushLeft.visible = false;
        this.parts.brushRight.visible = false;
        this.parts.power.visible = false;
        this.parts.commutator.visible = false;
        break;
      case 'commutator_only':
        this.targetExplodeProgress = 0;
        this.parts.base.visible = false;
        this.parts.magnetsLeftN.visible = false;
        this.parts.magnetsRightS.visible = false;
        this.parts.armatureCore.visible = false;
        this.parts.coil.visible = false;
        this.parts.power.visible = false;
        break;
      case 'exploded':
        this.targetExplodeProgress = 1.0;
        break;
    }
  }

  resetPartsAppearance() {
    [this.materials.magnetN, this.materials.magnetS, this.materials.baseChassis].forEach((m) => {
      m.transparent = false;
      m.opacity = 1.0;
    });
    this.materials.copper.emissive.set(0x000000);
    this.materials.copper.emissiveIntensity = 0;
    this.materials.brass.emissive.set(0x000000);
    this.materials.brass.emissiveIntensity = 0;
  }

  applyPartTransforms(t) {
    Object.keys(this.partTransforms).forEach((key) => {
      const part = this.parts[key];
      const tf = this.partTransforms[key];
      if (part && tf) {
        part.position.lerpVectors(tf.normal, tf.exploded, t);
      }
    });
  }

  setVisualLayerVisible(layerKey, visible) {
    if (this.visuals[layerKey]) {
      this.visuals[layerKey].visible = visible;
    }
  }

  setPartVisibility(partKey, visible) {
    if (partKey === 'magnets') {
      this.parts.magnetsLeftN.visible = visible;
      this.parts.magnetsRightS.visible = visible;
    } else if (partKey === 'brushes') {
      this.parts.brushLeft.visible = visible;
      this.parts.brushRight.visible = visible;
    } else if (this.parts[partKey]) {
      this.parts[partKey].visible = visible;
    }
  }

  toggleLabels(visible) {
    this.showLabels = visible;
    this.labelsGroup.visible = visible;
  }

  setAngleDegrees(deg) {
    this.isDampedMode = false;
    this.currentAngle = ((deg % 360) * Math.PI) / 180;
    this.applyRotation();
  }

  getAngleDegrees() {
    if (this.currentSceneIndex === 2) {
      return (this.act2Angle * (180 / Math.PI));
    }
    return (this.currentAngle * (180 / Math.PI)) % 360;
  }
}
