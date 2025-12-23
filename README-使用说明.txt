🏰 星妍秘密小屋 v8（两个人 · 联机同步 · 语音 · 宠物 · 美术统一）

打开方式（离线）
1) 解压后直接双击打开 index.html
2) 选择身份：🧸 星星 / ⚔️ 小妍
3) 两台设备输入同一个 6 位邀请码（本地离线也可各自记录；同码用于未来联机同步）

联机同步（强烈推荐：语音/自定义背景/宠物跨设备才会完整）
1) 在 Supabase 的 SQL Editor 里运行 supabase.sql（一次即可）
2) Dashboard -> Realtime -> Replication：打开 dc_entries / dc_comments / dc_reactions / dc_chat / dc_pets / dc_bg 的 Realtime
3) Storage：确认 bucket `dc_media` 已存在且为 Public（supabase.sql 已自动创建 + 开放策略）
4) 在页面「🏠 小屋」里填入 Supabase URL 与 publishable key
5) 两台设备输入同一个 6 位邀请码即可实时同步

v8 你提的 5 个点（已全部覆盖）
1) 🎙️ 语音发不出去：已做“安全上下文提醒 + Supabase Storage 完整 SQL + 上传失败自动降级本地可播”。
   - 注意：file:// 本地打开无法录音是浏览器限制；部署到 https（Vercel/Netlify）即可。
2) 🔘 交互按钮更美观：主按钮/幽灵按钮/标签/宠物按钮统一做了细腻高光与按压反馈，星星/小妍各自有专属强调色。
3) 🐾 每个人的养宠物：星星=兔兔，小妍=小狐；喂/摸摸/清洁/休息 + 自动衰减 + 升级；联机后实时同步。
4) 🎨 UI/字体美化（重点）：两人字体栈分开（可爱手账 vs 文艺古风），背景与纸张纹理统一画布；整体玻璃拟态更柔和。
5) 🔗 小屋设置 URL 跳转/联机：分享链接会自动加 https；但 file:// 无法自动识别当前地址，需要你先部署拿到域名。

部署 URL 推荐（两个人两台设备最好用）
- ✅ 最推荐：Vercel（免费、稳定、https 自动）
  - 你会得到：`https://你的项目名.vercel.app`
- 备选：Netlify（同样免费、https 自动）
  - 你会得到：`https://你的项目名.netlify.app`

提示
- 右侧面板提供：月历、联机邀请码、分享链接、导出备份
- 导出为 JSON（含 entries / comments / reactions / chat / media / byDate / pets / bg）
