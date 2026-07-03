// ==========================================
// === 1. 自定义直播源配置 (在此替换你的链接) ===
// ==========================================
// 支持 .m3u / .txt 格式，或者无后缀链接。程序会根据内容自动识别。
// ⚠️注意：这里目前还是原作者的源，如果失效了请替换成你自己的源
const SOURCE_URL = "https://0701.tv1288.xyz"; 

// ==========================================
// === 2. 配置全局引流信息 ====================
// ==========================================
//const PROMO_TITLE = "";
//const PROMO_URL = "";
//const PROMO_PIC = ""; 
// 去掉了原作者的阿里云截帧参数，确保你的图片能正常显示
// const PROMO_GROUP = "";
// const GLOBAL_PLAY_FROM = ""; 

// 【黑名单拦截库】只要匹配到这些词，整个分组或单个视频直接干掉
const SPAM_KEYWORDS = ["注意事项", "加群", "群", "TG", "tg", "交流", "防失联", "关注", "网址", "官网", "广告", "微信", "QQ", "最新", "获取资源", "备用", "防丢", "关于", "频道"];

// 生成引流 Vod 对象的函数
// function getPromoVodItem() {
//     return {
//         vod_id: "live_promo",
//         vod_name: PROMO_TITLE,
//         vod_pic: PROMO_PIC,
//         vod_remarks: "置顶引流",
//         vod_play_from: GLOBAL_PLAY_FROM,
//         vod_play_url: `引流视频$${PROMO_URL}`
//     };
// }

// 检查是否包含引流关键词
function isSpam(text) {
    if (!text) return false;
    return SPAM_KEYWORDS.some(kw => text.includes(kw));
}

export default {
    async fetch(request, env, ctx) {
        const url = new URL(request.url);
        const path = url.pathname;
        const params = url.searchParams;

        const corsHeaders = {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
            "Access-Control-Allow-Headers": "*"
        };

        if (request.method === "OPTIONS") {
            return new Response(null, { headers: corsHeaders });
        }

        try {
            // 1. 动态抓取原始直播源数据
            const response = await fetch(SOURCE_URL, {
                headers: {
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
                }
            });
            const sourceText = await response.text();
            
            // 2. 核心：自动识别格式并解析清洗
            const lines = sourceText.split('\n');
            let filteredList = []; // 存放清洗后的纯净数据
            
            // 判断是否为 M3U 格式
            const isM3uFormat = sourceText.includes('#EXTM3U') || sourceText.includes('#EXTINF');

            if (isM3uFormat) {
                // ================= 解析 M3U 格式 =================
                let currentInfo = null;
                for (let i = 0; i < lines.length; i++) {
                    let line = lines[i].trim();
                    if (!line) continue;

                    if (line.startsWith('#EXTINF')) {
                        // 兼容带引号和不带引号的 group-title，如果完全没有分类，归入"默认频道"
                        let groupMatch = line.match(/group-title=(?:"([^"]+)"|'([^']+)'|([^,\s]+))/);
                        let group = groupMatch ? (groupMatch[1] || groupMatch[2] || groupMatch[3]) : "默认频道";

                        // 增强版 logo 匹配
                        let logoMatch = line.match(/tvg-logo=(?:"([^"]+)"|'([^']+)'|([^,\s]+))/);
                        let logo = logoMatch ? (logoMatch[1] || logoMatch[2] || logoMatch[3]) : "";

                        // 安全提取频道名称
                        let commaIdx = line.indexOf(',');
                        let title = commaIdx > -1 ? line.substring(commaIdx + 1).trim() : "未知频道";
                        
                        // 自动匹配公共台标库
                        if (!logo) {
                            logo = `https://epg.112114.xyz/logo/${title}.png`;
                        }

                        currentInfo = { group, logo, title };
                    } 
                    else if (!line.startsWith('#') && currentInfo) {
                        currentInfo.url = line;
                        // 拦截逻辑
                        if (!isSpam(currentInfo.group) && !isSpam(currentInfo.title)) {
                            filteredList.push(currentInfo);
                        }
                        currentInfo = null;
                    }
                }
            } else {
                // ================= 解析 TXT 格式 =================
                // 默认赋予一个基础分类，防止完全没有分类的源丢失
                let currentGroup = "默认频道"; 
                for (let i = 0; i < lines.length; i++) {
                    let line = lines[i].trim();
                    if (!line) continue;

                    if (line.includes(',#genre#')) {
                        currentGroup = line.split(',')[0].trim();
                    } 
                    else if (line.includes(',')) {
                        let splitIndex = line.indexOf(',');
                        let title = line.substring(0, splitIndex).trim();
                        let playUrl = line.substring(splitIndex + 1).trim();
                        
                        // TXT 强制补全台标
                        let logo = `https://epg.112114.xyz/logo/${title}.png`;
                        
                        let currentInfo = { group: currentGroup, logo: logo, title: title, url: playUrl };
                        
                        // 拦截逻辑
                        if (!isSpam(currentInfo.group) && !isSpam(currentInfo.title)) {
                            filteredList.push(currentInfo);
                        }
                    }
                }
            }

            // ==========================================
            // 路由 1：纯净版 M3U 输出 (/live.m3u)
            // ==========================================
            if (path === "/live.m3u" || path.endsWith(".m3u")) {
                let outM3u = "#EXTM3U\n";
                outM3u += `#EXTINF:-1 group-title="${PROMO_GROUP}",${PROMO_TITLE}\n${PROMO_URL}\n`;
                filteredList.forEach(item => {
                    let logoAttr = item.logo ? ` tvg-logo="${item.logo}"` : "";
                    // 输出时如果没有分类也不要紧，就用“默认频道”兜底
                    outM3u += `#EXTINF:-1${logoAttr} group-title="${item.group}",${item.title}\n`;
                    outM3u += `${item.url}\n`;
                });
                return new Response(outM3u, {
                    headers: {
                        "Content-Type": "application/vnd.apple.mpegurl; charset=utf-8",
                        "Access-Control-Allow-Origin": "*"
                    }
                });
            }

            // ==========================================
            // 路由 2：TVBox / 影视仓 T4 接口 (极简版 JSON)
            // ==========================================
            let ac = params.get("ac");
            let t = params.get("t");
            let ids = params.get("ids");
            let wd = params.get("wd");

            // 初始化分类列表
            let classes = [
                { type_id: "all", type_name: "全部直播" },
                { type_id: "promo", type_name: PROMO_GROUP }
            ];
            let vodList = [];

            // 提取真实分类
            let uniqueGroups = [...new Set(filteredList.map(i => i.group))];
            uniqueGroups.forEach(g => {
                // 【核心优化】：如果是无分组的源，不生成冗余的分类标签
                // 让它乖乖地在“全部直播”里面自动展开即可
                if (g !== "默认频道") {
                    classes.push({ type_id: `group_${g}`, type_name: g });
                }
            });

            // 请求首页或引流组时塞入广告视频
            if (!t || t === "all" || t === "promo") {
                vodList.push(getPromoVodItem());
            }

            // 组装列表数据
            filteredList.forEach((item, index) => {
                let typeId = `group_${item.group}`;
                
                // 处理分类过滤和搜索
                if (!t || t === "all" || t === typeId) {
                    if (wd && !item.title.toLowerCase().includes(wd.toLowerCase())) return;

                    // 如果是默认频道，remarks(右上角角标) 置空，显得更干净
                    let remarks = item.group === "默认频道" ? "在线" : item.group;

                    vodList.push({
                        vod_id: `live_${index}`,
                        vod_name: item.title,
                        vod_pic: item.logo,
                        vod_remarks: remarks,
                        vod_play_from: "在线直播", 
                        vod_play_url: `主线路$${item.url}`
                    });
                }
            });

            // 处理详情请求
            if (ac === "detail" && ids) {
                let idArr = ids.split(",");
                let detailList = [];

                if (idArr.includes("live_promo")) {
                    detailList.push({
                        vod_id: "live_promo",
                        vod_name: PROMO_TITLE,
                        vod_pic: PROMO_PIC,
                        vod_content: "请关注我的TG频道@tmxktg", // 👈 帮你把原作者的简介改成了你的
                        vod_play_from: GLOBAL_PLAY_FROM,
                        vod_play_url: `引流视频$${PROMO_URL}`
                    });
                }

                let regularItems = vodList.filter(v => idArr.includes(v.vod_id) && v.vod_id !== "live_promo");
                detailList.push(...regularItems);

                return new Response(JSON.stringify({
                    list: detailList
                }), { headers: { "Content-Type": "application/json; charset=utf-8", "Access-Control-Allow-Origin": "*" } });
            }

            // 返回最终的 JSON
            return new Response(JSON.stringify({
                class: classes, 
                list: vodList
            }), { headers: { "Content-Type": "application/json; charset=utf-8", "Access-Control-Allow-Origin": "*" } });

        } catch (err) {
            return new Response(JSON.stringify({ "list": [] }), { 
                status: 500, 
                headers: { "Content-Type": "application/json; charset=utf-8", "Access-Control-Allow-Origin": "*" }
            });
        }
    }
};