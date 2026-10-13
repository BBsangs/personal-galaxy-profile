export const assetBase = import.meta.env?.BASE_URL ?? './';
export const profile = {
  name: '沈均来',
  intent: '10年工作经验 | 求职意向：前端开发工程师 | 期望城市：无锡', salary: '15-18K',
  personal: '男 | 30岁', phone: '15061893205', wechat: '15061893205', email: '565608529@qq.com',
};

const eyeIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/><path class="eye-slash" d="m4 4 16 16"/></svg>';
export function privateField(key, label, mask) {
  return `<span class="private-field" data-private-field="${key}" data-private-label="${label}" data-private-mask="${mask}"><span class="private-label">${label}</span><span data-private-value>${mask}</span><button class="privacy-toggle" type="button" data-private-toggle aria-pressed="false" aria-label="显示${label}">${eyeIcon}</button></span>`;
}
export const portraitMarkup = `<span class="profile-avatar"><img src="${assetBase}avatar.webp" width="144" height="144" alt="爆炸头卡通头像" /></span>`;
export const profileSummary = `<h1>${profile.name}<span>前端开发工程师</span></h1><p>${profile.intent}</p><div class="resume-meta">${privateField('personal', '个人信息', '性别 · 年龄已隐藏')}${privateField('salary', '期望薪资', '已隐藏')}${privateField('phone', '电话', '150****3205')}${privateField('wechat', '微信', '150****3205')}${privateField('email', '邮箱', '5******9@qq.com')}</div>`;

// Original resume wording; only PDF line wraps and typographic ligatures are normalized.
export const advantages = `资深前端开发者，具备扎实的移动端ios、flutter，小程序，vue等开发经验，能够独立完成从需求分析、系统设计、代码实现到上线的完整开发流程。
丰富的系统架构设计经验，能够根据业务需求设计高可用、可扩展、易维护的系统架构，并有多个大型项目的架构设计和重构工作经验。
具备丰富的性能优化经验，能够针对内存泄漏、卡顿、耗电等问题进行有效分析和优化，提升应用性能和用户体验。
精通 Objective-C、Swift 和 Flutter 跨平台开发框架，熟悉 uni-app 微信小程序开发，并具备 Python3 脚本开发能力，能够灵活运用多种技术栈推动应用落地。
能够密切关注移动开发领域最新技术动态，愿意积极探索和实践新技术列如鸿蒙next等，并有效地将这些新技术融入实际项目，推动产品创新。
持有 PMP项目管理专业人士认证，具备良好的项目管理和团队协作能力，能够高效推进项目进展并确保项目质量。`;

export const experience = [
  {
    date: '2025.04-至今', company: '无锡即刻飞行科技有限公司', role: '前端开发工程师',
    text: `1. 作为前端开发负责人，主导iOS、安卓及管理端Vue项目的整体开发流程，协调资源并推动任务高效执行
2. 负责前端开发任务的规划与实施，确保产品需求准确落地，保障功能按时高质量交付
3. 参与需求评审与技术方案设计，优化前端架构，提升系统性能与用户体验
4. 推动团队协作与代码规范，提升开发效率与代码质量，保障项目稳定运行`,
  },
  {
    date: '2022.02-2024.11', company: '江苏发货帮数字科技有限公司', role: 'flutter',
    text: `负责发货帮APP基于Flutter框架的研发工作，并主导应用架构设计与重构，使应用性能、页面加载速度均有提升，定期对现有应用进行技术审查，提出并实施优化方案，优化现有代码结构，大量减少了代码重复率提高项目可维护性。
负责部分微信小程序基于uniapp的开发工作。
同时主动参与需求评估与技术方案讨论，能够深度理解线下业务场景，提出创新性解决方案，与业务融合，提升订单转化率。
整理各大市场上架资料，并对应各大市场的多轮审核及备案相关信息审核。
同时推进小程序版本的开发与迭代，采用Uniapp框架实现跨平台开发，确保小程序与移动应用功能一致性。`,
  },
  {
    date: '2019.07-2022.01', company: '江苏洁澄水业科技有限公司', role: 'iOS',
    text: `主导公司iOS平台云OA应用及微信小程序商城uniapp的应用程序开发。
参与项目需求分析与技术解决方案的确认，同时自主合理分配任务与项目进度规划。
完成iOS端app的全面重构工作，完善设计全新技术框架，确保在既定时间内完成项目重构，在重构期间同时迅速响应需求变更，规划重构进度，按时上线应用功能，重构后应用更加稳定，同时提升业务员使用移动OA业务处理效率。
工作间隙自学Vue，并接手Uniapp项目的开发迭代与优化。`,
  },
  {
    date: '2016.01-2019.06', company: '无锡文思海辉信息技术有限公司', role: 'iOS',
    text: '主要负责多个 Mac 端应用的迭代开发与维护工作，并参与了移动APP流媒体播放项目，独立完成在线流媒体播放器的框架设计与搭建。同时，积极学习并应用 Python 技术，参与 IoT 项目的研发工作，设计并绘制了整体 IoT 项目的框架图，完成了硬件设备的挑选、采购及技术对接，并实地改造公司会议室为展示场地。此外，设计并制作了移动展示箱，参加日本智能家具展览，展示了项目成果。',
  },
];

export const projects = [
  {
    name: '飞机APP', role: 'IOS开发工程师', date: '2025.04-至今',
    text: `飞机APP是一款集加密即时通讯、社交互动、会员体系于一体的社交产品。
主要负责IOS客户端核心功能研发、架构升级、稳定性增强工作。
主导前端IOS，安卓，管理台Vue等需求落地开发进度管控等工作，承担前端主管责任。`,
  },
  {
    name: '发货帮', role: 'Flutter研发', date: '2022.02-2024.11',
    text: `内容:
发货帮APP是中国领先的大票零担交易平台，基于Flutter框架开发，覆盖iOS、Android及微信小程序。平台专注于为小微物流企业提供公路及航空大票零担的线上交易服务，核心功能包括专线查询、在线下单、物流跟踪、费用计算和在线报价。通过数字化手段，发货帮致力于帮助小微物流企业降本增效，推动物流行业数字化转型，为用户提供高效、便捷的一站式物流交易解决方案。
业绩:
使用 Flutter 框架开发跨平台移动应用，确保 iOS 和 Android 平台功能的高度一致性和用户体验的无缝衔接。
参与项目需求研讨，并完成产品需求工作包的拆分，能合理安排需求优先级及时间进度。
高效完成功能开发、性能优化及问题修复任务，保障项目按时交付并符合需求。
主导应用市场上架，同时应对市场审核要求确保应用顺利上线。
持续优化应用性能，进行框架优化，推动产品迭代更新，并学习鸿蒙OS，推进鸿蒙版本落地。`,
  },
  {
    name: '吉善泉微信小程序', role: '开发', date: '2020.07-2021.12',
    text: `内容:
2C的微信在线商城，用户能够在线购选购公司上架的产品。提供在线购买套餐、水票、机器的服务。
业绩:
通过自学Vue，接手uni-app项目。参与公司电商商城的整体需求讨论，规划产品开发迭代任务，与后端开发者协调合作，完成小程序的整体代码开发任务确保项目正确上线。`,
  },
  {
    name: '洁澄云OA', role: '开发', date: '2019.06-2021.12',
    text: `内容:
公司内部业务员OA系统，能够管理本公司所有员工的基本信息，分层级管理全体销售员的业务轨迹，完整采集业务流程中的有效数据，根据业务规则对有效数据进行整理、分析，提供详尽、美观的业务数据报表。
业绩:
在短时间内了解熟悉项业务的复杂逻辑，并且在限定的时间内按时完成项目的重构.`,
  },
  {
    name: '索尼精选Hi-res App', role: 'ios流媒体端 开发/维护', date: '2018.04-2019.07',
    text: `内容:
索尼精选Hi-Res音乐-听见好音质 来自 Sony (China) Limited
https://music.sonyselect.net/
业绩:
独立担任完成在线流媒体播放器的框架设计及搭建，攻克技术难点，实现高解析 度音频在线播放，并且支持高解析DAC外设输出。`,
  },
  {
    name: 'Sony Applications For Mac', role: 'Mac平台APP维护与二次开发', date: '2016.03-2019.07',
    text: `内容:
2016/03 - 2016/09
Remote Camera Controller for Mac
APP简介：该项目为sony 相机配套mac平台设计 用户将相机通过USB与电脑链接相机可实现电脑端控制相机拍照录像，修改相机参数等操作。拍摄的照片与视频会同步保存到用户指定的文件夹。

2016/03 - 2016/09
WalkmanHelpGuideInstaller for Mac
APP简介：该项目为Sony walkman 在Mac平台上的配套软件，用户可以通过软件将对应型号Walkman的帮助指南文档快捷方便安装至电脑中。

2016/03 - 2016/12
Conntect Transfer  for Mac
APP简介：该项目为sony walkman 设备的配套软件，用户将Waklman通过USB与电脑连接，通过该软件能够方便快捷的将，歌单、歌曲、照片、播客方便快捷的导入walkman或者从Walkman中移除。

2016/03 - 2016/09
HAP Music Transfer for mac
APP简介：该项目为sony HAP  系列产品在mac平台上的配套软件，用户可以通过软件在Mac平台上与同一局域网下的设备对设备进行文件的传送管理及设备名称修改。

2016/03 - 2016/09
SoftwareUpdateTool for Walkman
APP简介：该项目为sony walkman 在mac平台上的固件更新程序，用户将Walkman与电脑连接通过软件能够将sony walkman中的固件更新成最新版本。

责任描述：负责修改更新项目OC语言的弃用函数修改及二次开发。
业绩:
维护多个mac端索尼设备app，与日方客户需求对接，确保在mac os 多个版本系统上迭代`,
  },
  {
    name: 'OctoIoTForLife', role: 'Python后台，硬件设备对接', date: '2018.09-2019.05',
    text: `内容:
担任：Python后台框架开发，硬件设备对接
项目描述：OctoIoT For Life Demo box 是一款定义为民用物联产品研发成果的展物。其中分为Hotel Solution 和Office Solution 该Demo展现了OctoIoT For Life系统与市场上现有底层设备的无缝对接。能够对常活中的设备进数据采集和灵活应用，通过OctoIoT可以对设备进灵活控制和对生活习惯的数据进行采集存储，并进行相应设定和服务推荐。
项目展视频：Hotel Solution Video Office Solution Video
业绩:
通过自学python3参与项目，负责项目设备硬件的挑选与对接，设计绘制项目的框架图， 完成设备的控制及自动化的设计，改造公司的会议室作为展示场地。参与移动展示箱的设计及制作，并且在日本智能家居展上展示。`,
  },
  {
    name: 'Epson Center Show', role: '开发', date: '2017.08-2017.12',
    text: '该项目为Epson中国体验中心开发的一个集成移动APP(在iOS系统上开发)。 APP通过与node.js服务器交互，实现在体验中心，通过iPad控制打印机，扫描仪，标签 打印机器等设备，给客户进行产品演示。这个移动APP操作简单、方便，通过这个集成 移动APP可以控制不同的与node.js服务器链接等设备。',
  },
  {
    name: 'CookingOrchestration', role: 'IPad app与需求文档编写', date: '2017.02-2017.03',
    text: `内容:
该项目为Ipad端演示用APP 主要展示了 Panasonic 厨房智能家电的联合使用的效果。其中拥有丰富的动画效果。
业绩:
按时按质完成`,
  },
  {
    name: 'Nuromobile', role: 'iphone端开发', date: '2016.11-2017.01',
    text: `内容:
该项目为一款在移动端支持运行的网络电话，主要实现有三大功能，在键盘上拨打网络电话，从通讯录中选择对象，拨打网络电话和在通话记录中，选择对象拨打网络电话。
业绩:
日语环境下使用UILocalizedIndexedCollation 对于通讯录联系人排序 及索引自定义`,
  },
];

export const mapSize = { width: 760, depth: 650 };
export const galaxies = [
  { id: 'profile', title: '基本资料', english: 'ORIGIN', x: -205, z: 90, radius: 61, color: '#80dfcf', destination: 'about' },
  { id: 'career', title: '公司经历', english: 'CHRONICLE', x: -145, z: -145, radius: 79, color: '#f2bd8a', destination: 'career-1' },
  { id: 'projects', title: '项目经历', english: 'CREATIONS', x: 140, z: -35, radius: 118, color: '#c5a4ff', destination: 'project-1' },
  { id: 'contact', title: '联系方式', english: 'SIGNAL', x: 170, z: 205, radius: 47, color: '#8bcdff', destination: 'contact' },
];
export const stations = [
  { id: 'about', title: '关于我', english: '基本资料', galaxy: 'profile', kind: 'house', x: -218, z: 84, radius: 13, biome: 'garden' },
  { id: 'skills', title: '技术栈', english: '个人优势', galaxy: 'profile', kind: 'house', x: -180, z: 65, radius: 11.8, biome: 'ice' },
  { id: 'contact', title: '联系我', english: '联系方式', galaxy: 'contact', kind: 'house', x: 170, z: 205, radius: 15, biome: 'desert' },
  ...projects.map((project, i) => ({
    id: `project-${i + 1}`, title: project.name, english: '项目经历', galaxy: 'projects', kind: 'project', project,
    radius: i === 5 ? 21.5 : i === 6 ? 13 : 10.5,
    biome: ['ice', 'desert', 'water', 'moon', 'moon', 'ice', 'garden', 'desert', 'lava', 'water'][i],
  })),
  ...experience.map((job, i) => ({
    id: `career-${i + 1}`, title: job.company, english: '公司经历', galaxy: 'career', kind: 'career', job,
    x: -145 + [0,-36,4,40][i], z: -145 + [0,-10,-43,-30][i], radius: 12.5,
    biome: ['garden', 'desert', 'ice', 'moon'][i],
  })),
];
// Seeded placement keeps the irregular star chart stable when revisiting it.
let layoutSeed = 431;
const placed = [];
const chronological = stations.filter(s => s.project).sort((a, b) => b.project.date.localeCompare(a.project.date));
let previousDistance = -4;
chronological.forEach((station, rank) => {
  let distance = Math.max(rank ? 25 + rank * 7 : 3, previousDistance + 6);
  for (let attempt = 0; attempt < 4096; attempt++) {
    layoutSeed = (layoutSeed * 16807) % 2147483647;
    const angle = layoutSeed / 2147483647 * Math.PI * 2;
    const x = 140 + Math.cos(angle) * distance, z = -35 + Math.sin(angle) * distance;
    if (placed.every(other => Math.hypot(x - other.x, z - other.z) > station.radius + other.radius + 7)) {
      Object.assign(station, { x, z });
      break;
    }
    if (attempt % 256 === 255) distance += 2;
  }
  if (station.x === undefined) throw new Error('Unable to place island');
  previousDistance = distance;
  placed.push(station);
});
stations.forEach(station => Object.assign(station, {
  stop: { x: station.x, z: station.z + station.radius + 2.5 }, labelY: 11,
}));
export const portals = galaxies.map((galaxy, i) => ({
  id: `portal-${galaxy.id}`, galaxy: galaxy.id,
  x: galaxy.x + [41,42,-63,-36][i], z: galaxy.z + [39,30,-75,-25][i],
  destination: galaxies[(i + 1) % galaxies.length].destination,
  title: galaxies[(i + 1) % galaxies.length].title,
  color: galaxies[(i + 1) % galaxies.length].color,
}));

// Resume dates have month precision; do not invent start/end days or count both months twice.
export function dateDuration(date, now = new Date()) {
  const match = /^(\d{4})\.(\d{2})-(?:(\d{4})\.(\d{2})|(至今))$/.exec(date);
  if (!match) return '';
  const parts = new Intl.DateTimeFormat('en', { timeZone: 'Asia/Shanghai', year: 'numeric', month: 'numeric' }).formatToParts(now);
  const endYear = match[5] ? Number(parts.find(p => p.type === 'year').value) : Number(match[3]);
  const endMonth = match[5] ? Number(parts.find(p => p.type === 'month').value) : Number(match[4]);
  const months = Math.max(0, (endYear - Number(match[1])) * 12 + endMonth - Number(match[2]));
  return months ? `${months >= 12 ? `${Math.floor(months / 12)}年` : ''}${months % 12 ? `${months % 12}个月` : ''}` : '不足1个月';
}

export function stationTimeline(station) {
  const date = station.project?.date || station.job?.date;
  if (date) return [date, `${station.job ? '任职' : '项目周期'} ${dateDuration(date)} · 按月计算`];
  if (station.id === 'about') return ['10年工作经验', '前端开发工程师'];
  if (station.id === 'skills') return ['2011-2016 / 2017-2020', '教育经历 · PMP项目管理认证'];
  return ['无锡', '联系信息'];
}

const escapeHTML = text => text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
function paragraphs(text) {
  return `<div class="resume-copy">${text.split('\n').filter(Boolean).map(line => {
    const value = escapeHTML(line);
    if (line === '内容:' || line === '业绩:') return `<h4>${value}</h4>`;
    if (line === 'https://music.sonyselect.net/') return `<p><a href="${line}" target="_blank" rel="noopener noreferrer">${value}</a></p>`;
    return `<p>${value}</p>`;
  }).join('')}</div>`;
}
const projectBody = p => `<p class="role">${p.role}</p><time>${p.date}</time>${paragraphs(p.text)}`;
const career = `<h3 class="subheading">工作经历</h3><ol class="billboard-career">${experience.map(e => `<li><h3>${e.company}</h3><p class="role">${e.role}</p><time>${e.date}</time>${paragraphs(e.text)}</li>`).join('')}</ol>`;
const education = `<h3 class="subheading">教育经历</h3><div class="resume-copy"><p>郑州大学　本科　计算机科学与技术<br><time>2017-2020</time></p><p>江苏联合职业技术学院　大专　计算机网络技术<br><time>2011-2016</time></p></div><h3 class="subheading">资格证书</h3><p class="resume-copy">PMP项目管理认证</p>`;
const contact = `<p>${profile.intent}</p><p class="privacy-note">联系信息默认脱敏，点击小眼睛查看，再次点击隐藏。</p><div class="private-contact">${privateField('phone', '电话', '150****3205')}${privateField('wechat', '微信', '150****3205')}${privateField('email', '邮箱', '5******9@qq.com')}${privateField('personal', '个人信息', '性别 · 年龄已隐藏')}${privateField('salary', '期望薪资', '已隐藏')}</div>`;
const about = `<div class="billboard-profile">${portraitMarkup}<div><h3>${profile.name}</h3>${privateField('personal', '个人信息', '性别 · 年龄已隐藏')}</div></div><p>${profile.intent}</p>${privateField('salary', '期望薪资', '已隐藏')}<h3 class="subheading">个人优势</h3>${paragraphs(advantages)}${education}`;

export function billboardMarkup(station) {
  if (station.project) return projectBody(station.project);
  if (station.job) return `<p class="role">${station.job.role}</p><time>${station.job.date}</time>${paragraphs(station.job.text)}`;
  if (station.id === 'about') return about;
  if (station.id === 'skills') return `${paragraphs(advantages)}${education}`;
  return contact;
}

export const sections = {
  about: { heading: '基本资料', body: about },
  career: { heading: '公司经历', body: career },
  projects: {
    heading: '项目经历',
    body: `<div class="project-list">${projects.map((p, i) => `<details class="project" open><summary><span class="project-index">${String(i + 1).padStart(2, '0')}</span><span class="project-name">${p.name}</span><span class="project-plus" aria-hidden="true">+</span></summary><div class="project-body">${projectBody(p)}</div></details>`).join('')}</div>`,
  },
  skills: { heading: '个人优势', body: `${paragraphs(advantages)}${education}` },
  contact: { heading: '联系我', body: contact },
};
