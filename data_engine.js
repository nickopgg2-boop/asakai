// --- data_engine.js (DMS 4.0 KPI Engine - Date Stable / Monthly Dashboard / Real Form Data) ---
// เก็บข้อมูลไว้ใน localStorage ชื่อ dms_jobs เพื่อให้เปิดใช้งานบน GitHub Pages ได้โดยไม่ต้องมี Backend

const DMS_STORAGE_KEY = 'dms_jobs';
const DMS_SHEET_API_KEY = 'dms_sheet_api_url';

function getDmsSheetApiUrl() {
    return (localStorage.getItem(DMS_SHEET_API_KEY) || '').trim();
}

function setDmsSheetApiUrl(url) {
    const clean = String(url || '').trim();
    if (clean) localStorage.setItem(DMS_SHEET_API_KEY, clean);
    else localStorage.removeItem(DMS_SHEET_API_KEY);
}

function isDmsCloudEnabled() {
    return Boolean(getDmsSheetApiUrl());
}

function saveJobsToLocal(jobs) {
    localStorage.setItem(DMS_STORAGE_KEY, JSON.stringify((jobs || []).map(normalizeJob)));
    window.dispatchEvent(new Event('dms_jobs_updated'));
}

function syncJobToSheet(jobObj) {
    const apiUrl = getDmsSheetApiUrl();
    if (!apiUrl || !jobObj) return;

    const form = new FormData();
    form.append('action', 'upsert');
    form.append('payload', JSON.stringify(normalizeJob(jobObj)));

    fetch(apiUrl, { method: 'POST', mode: 'no-cors', body: form })
        .catch(err => console.warn('DMS cloud sync failed:', err));
}

function deleteJobFromSheet(jobId) {
    const apiUrl = getDmsSheetApiUrl();
    if (!apiUrl || !jobId) return;

    const form = new FormData();
    form.append('action', 'delete');
    form.append('jobId', jobId);

    fetch(apiUrl, { method: 'POST', mode: 'no-cors', body: form })
        .catch(err => console.warn('DMS cloud delete failed:', err));
}

function pushAllJobsToSheet() {
    const apiUrl = getDmsSheetApiUrl();
    if (!apiUrl) return;

    const form = new FormData();
    form.append('action', 'bulk_upsert');
    form.append('payload', JSON.stringify(getAllJobs()));

    fetch(apiUrl, { method: 'POST', mode: 'no-cors', body: form })
        .then(() => { if (typeof showToast === 'function') showToast('ส่งข้อมูล localStorage ไป Google Sheet แล้ว', 'success'); })
        .catch(err => {
            console.warn('DMS cloud bulk sync failed:', err);
            if (typeof showToast === 'function') showToast('ส่งข้อมูลไป Google Sheet ไม่สำเร็จ', 'error');
        });
}

function pullJobsFromSheet() {
    const apiUrl = getDmsSheetApiUrl();
    if (!apiUrl) return;

    const callbackName = `dmsSheetCallback_${Date.now()}`;
    window[callbackName] = function(response) {
        try {
            if (response && response.ok && Array.isArray(response.jobs)) {
                const cloudJobs = response.jobs.map(normalizeJob);
                const localJobs = getAllJobs();
                const merged = new Map();

                localJobs.forEach(j => merged.set(j.jobId, j));
                cloudJobs.forEach(j => merged.set(j.jobId, j));

                saveJobsToLocal([...merged.values()]);
                if (typeof showToast === 'function') showToast('โหลดข้อมูลจาก Google Sheet แล้ว', 'success');
            }
        } catch (err) {
            console.warn('DMS cloud pull parse failed:', err);
        } finally {
            delete window[callbackName];
            const tag = document.getElementById(callbackName);
            if (tag) tag.remove();
        }
    };

    const sep = apiUrl.includes('?') ? '&' : '?';
    const script = document.createElement('script');
    script.id = callbackName;
    script.src = `${apiUrl}${sep}action=list&callback=${callbackName}`;
    script.onerror = () => {
        if (typeof showToast === 'function') showToast('โหลดข้อมูลจาก Google Sheet ไม่สำเร็จ', 'error');
        delete window[callbackName];
        script.remove();
    };
    document.body.appendChild(script);
}

window.addEventListener('DOMContentLoaded', () => {
    if (isDmsCloudEnabled()) {
        setTimeout(() => pullJobsFromSheet(), 300);
    }
});

function pad2(value) {
    return String(value).padStart(2, '0');
}

function getLocalDateString(dateObj) {
    if (!dateObj || isNaN(dateObj.getTime())) return null;
    return `${dateObj.getFullYear()}-${pad2(dateObj.getMonth() + 1)}-${pad2(dateObj.getDate())}`;
}

function getLocalISOString() {
    const now = new Date();
    const offsetMs = now.getTimezoneOffset() * 60 * 1000;
    return new Date(now.getTime() - offsetMs).toISOString().slice(0, 19);
}

function getLocalDatetimeInputValue() {
    return getLocalISOString().slice(0, 16);
}

function extractDateString(value) {
    if (!value) return null;
    if (value instanceof Date) return getLocalDateString(value);
    const text = String(value).trim();
    const match = text.match(/^(\d{4}-\d{2}-\d{2})/);
    return match ? match[1] : null;
}

function parseLocalDate(dateStr) {
    const clean = extractDateString(dateStr);
    if (!clean) return null;
    const [year, month, day] = clean.split('-').map(Number);
    if (!year || !month || !day) return null;
    const date = new Date(year, month - 1, day);
    if (isNaN(date.getTime())) return null;
    date.setHours(0, 0, 0, 0);
    return date;
}

function addDays(dateObj, days) {
    const d = new Date(dateObj);
    d.setDate(d.getDate() + days);
    return d;
}

function getCurrentMonthBounds(referenceDate = new Date()) {
    const start = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), 1);
    const end = new Date(referenceDate.getFullYear(), referenceDate.getMonth() + 1, 0);
    return {
        startDate: getLocalDateString(start),
        endDate: getLocalDateString(end)
    };
}

function getDateRangeList(startDate, endDate) {
    const start = parseLocalDate(startDate);
    const end = parseLocalDate(endDate);
    if (!start || !end || start > end) return [];

    const result = [];
    let cursor = new Date(start);
    while (cursor <= end) {
        result.push(getLocalDateString(cursor));
        cursor = addDays(cursor, 1);
    }
    return result;
}

function isDateInRange(dateStr, startDate, endDate) {
    const checkDate = parseLocalDate(dateStr);
    if (!checkDate) return false;

    const start = parseLocalDate(startDate);
    const end = parseLocalDate(endDate);

    if (start && checkDate < start) return false;
    if (end && checkDate > end) return false;
    return true;
}

function getJobDate(job) {
    return job.plannedDate || extractDateString(job.requestAt) || extractDateString(job.closedAt) || getLocalDateString(new Date());
}

function calculateJobDowntimeMinutes(job) {
    if (!job || !job.startTime || !job.endTime) return null;

    const start = new Date(job.startTime).getTime();
    const end = new Date(job.endTime).getTime();
    if (!isNaN(start) && !isNaN(end)) {
        const diff = Math.round((end - start) / 60000);
        return diff >= 0 ? diff : null;
    }

    const startText = String(job.startTime).replace('น.', '').trim();
    const endText = String(job.endTime).replace('น.', '').trim();
    const timePattern = /^\d{1,2}:\d{2}$/;
    if (timePattern.test(startText) && timePattern.test(endText)) {
        const [sh, sm] = startText.split(':').map(Number);
        const [eh, em] = endText.split(':').map(Number);
        let diff = (eh * 60 + em) - (sh * 60 + sm);
        if (diff < 0) diff += 24 * 60;
        return diff;
    }

    return null;
}

function normalizeJob(job = {}) {
    const requestAt = job.requestAt || job.time || getLocalISOString();
    const plannedDate = job.plannedDate || extractDateString(requestAt) || extractDateString(job.closedAt) || getLocalDateString(new Date());
    const status = job.status === 'done' ? 'closed' : (job.status || 'pending');
    const normalized = {
        jobId: job.jobId || job.id || `REQ-${Date.now()}`,
        requestAt,
        plannedDate,
        sap: job.sap || job.sapRef || '',
        dept: job.dept || 'UNKNOWN-DEPT',
        dieId: String(job.dieId || job.assetId || 'UNKNOWN-DIE').toUpperCase(),
        partName: job.partName || job.part || job.part_name || 'ไม่ระบุชื่อ Part',
        partNumber: job.partNumber || job.partNo || job.part_number || '',
        model: job.model || job.modelName || '',
        defect: job.defect || job.problemDesc || job.problem || '',
        partStock: job.partStock || '',
        priority: job.priority || 'ปกติ',
        status,
        assignedTech: job.assignedTech || null,
        startTime: job.startTime || null,
        endTime: job.endTime || null,
        repairMethod: job.repairMethod || job.repairCategory || null,
        rootCause: job.rootCause || job.repairDetail || null,
        downtimeMinutes: typeof job.downtimeMinutes === 'number' ? job.downtimeMinutes : null,
        jobType: job.jobType || (job.dept === 'PM' ? 'PM' : 'BM'),
        closedBy: job.closedBy || null,
        closedAt: job.closedAt || null,
        isScheduledForProduction: job.isScheduledForProduction !== undefined ? job.isScheduledForProduction : true,
        shiftPlannedMinutes: Number(job.shiftPlannedMinutes || 480)
    };

    if (normalized.downtimeMinutes === null) {
        normalized.downtimeMinutes = calculateJobDowntimeMinutes(normalized);
    }

    return normalized;
}

function getAllJobs() {
    try {
        const jobs = JSON.parse(localStorage.getItem(DMS_STORAGE_KEY));
        if (!Array.isArray(jobs)) return [];
        return jobs.map(normalizeJob).sort((a, b) => {
            const da = `${getJobDate(a)} ${a.requestAt || ''}`;
            const db = `${getJobDate(b)} ${b.requestAt || ''}`;
            return db.localeCompare(da);
        });
    } catch (error) {
        console.warn('DMS: cannot read jobs from localStorage', error);
        return [];
    }
}

function saveJob(jobObj) {
    const jobs = getAllJobs();
    const normJob = normalizeJob(jobObj);
    const index = jobs.findIndex(j => j.jobId === normJob.jobId);

    if (index !== -1) jobs[index] = normJob;
    else jobs.push(normJob);

    localStorage.setItem(DMS_STORAGE_KEY, JSON.stringify(jobs));
    window.dispatchEvent(new Event('dms_jobs_updated'));
    syncJobToSheet(normJob);
}

function deleteJobById(jobId) {
    const jobs = getAllJobs().filter(j => j.jobId !== jobId);
    localStorage.setItem(DMS_STORAGE_KEY, JSON.stringify(jobs));
    window.dispatchEvent(new Event('dms_jobs_updated'));
    deleteJobFromSheet(jobId);
}

function getTrendDates(startDate, endDate) {
    if (startDate && endDate) return getDateRangeList(startDate, endDate);
    if (startDate && !endDate) return [extractDateString(startDate)];
    if (!startDate && endDate) return [extractDateString(endDate)];

    const month = getCurrentMonthBounds();
    return getDateRangeList(month.startDate, month.endDate);
}

function getAnalysisDays(filteredJobs, startDate, endDate) {
    if (startDate && endDate) return Math.max(getDateRangeList(startDate, endDate).length, 1);
    const uniqueDates = new Set(filteredJobs.map(getJobDate));
    return Math.max(uniqueDates.size, 1);
}

function fetchAndCalculateKPIs(startDate = null, endDate = null) {
    const allJobs = getAllJobs();
    const hasDateFilter = Boolean(startDate || endDate);
    const filteredJobs = hasDateFilter ? allJobs.filter(j => isDateInRange(getJobDate(j), startDate, endDate)) : allJobs;

    const closedJobs = filteredJobs.filter(j => j.status === 'closed');
    const breakdowns = closedJobs.filter(j => j.jobType === 'BM');
    const pmClosed = closedJobs.filter(j => j.jobType === 'PM');

    const totalRepairMinutes = breakdowns.reduce((sum, job) => sum + (Number(job.downtimeMinutes) || 0), 0);
    const avgMTTR = breakdowns.length > 0 ? Math.round(totalRepairMinutes / breakdowns.length) : 0;

    const uniqueDates = [...new Set(breakdowns.map(getJobDate))];
    let sumDailyMTBF = 0;
    uniqueDates.forEach(dateStr => {
        const dayBreakdowns = breakdowns.filter(j => getJobDate(j) === dateStr);
        const dailyRepairMinutes = dayBreakdowns.reduce((sum, job) => sum + (Number(job.downtimeMinutes) || 0), 0);
        const activeDies = new Set(filteredJobs.filter(j => getJobDate(j) === dateStr && j.isScheduledForProduction).map(j => j.dieId));
        const activeCount = Math.max(activeDies.size, 1);
        const runningMinutes = Math.max((480 * activeCount) - dailyRepairMinutes, 0);
        sumDailyMTBF += dayBreakdowns.length > 0 ? Math.round(runningMinutes / dayBreakdowns.length) : 0;
    });
    const avgMTBF = uniqueDates.length > 0 ? Math.round(sumDailyMTBF / uniqueDates.length) : 0;

    const depts = ['S-D', 'L-D', 'P-D'];
    const byDept = {};
    depts.forEach(dept => {
        const deptJobs = filteredJobs.filter(j => j.dept === dept);
        const deptBreakdowns = breakdowns.filter(j => j.dept === dept);
        const deptRepairMinutes = deptBreakdowns.reduce((sum, job) => sum + (Number(job.downtimeMinutes) || 0), 0);
        byDept[dept] = {
            totalJobs: deptJobs.length,
            breakdowns: deptBreakdowns.length,
            repairMinutes: deptRepairMinutes,
            mttr: deptBreakdowns.length > 0 ? Math.round(deptRepairMinutes / deptBreakdowns.length) : 0
        };
    });

    const analysisDays = getAnalysisDays(filteredJobs, startDate, endDate);
    const dieStats = {};
    breakdowns.forEach(job => {
        if (!dieStats[job.dieId]) {
            dieStats[job.dieId] = {
                dieId: job.dieId,
                partName: job.partName,
                partNumber: job.partNumber,
                model: job.model,
                breakdownCount: 0,
                totalRepairMinutes: 0
            };
        }
        dieStats[job.dieId].breakdownCount += 1;
        dieStats[job.dieId].totalRepairMinutes += Number(job.downtimeMinutes) || 0;
    });

    const topBadActors = Object.values(dieStats).map(item => {
        const mttrEstimate = item.breakdownCount > 0 ? Math.round(item.totalRepairMinutes / item.breakdownCount) : 0;
        const estUptime = Math.max((analysisDays * 480) - item.totalRepairMinutes, 0);
        const mtbfEstimate = item.breakdownCount > 0 ? Math.round(estUptime / item.breakdownCount) : 0;
        return { ...item, mttrEstimate, mtbfEstimate };
    }).sort((a, b) => {
        if (a.mtbfEstimate !== b.mtbfEstimate) return a.mtbfEstimate - b.mtbfEstimate;
        return b.breakdownCount - a.breakdownCount;
    }).slice(0, 5);

    const trend = { labels: [], dates: [], mttrSeries: [], mtbfSeries: [], breakdownSeries: [], repairMinutesSeries: [], pmSeries: [] };
    const datesToPlot = getTrendDates(startDate, endDate);

    datesToPlot.forEach(dateStr => {
        const dayJobs = allJobs.filter(j => getJobDate(j) === dateStr);
        const dayBreakdowns = dayJobs.filter(j => j.jobType === 'BM' && j.status === 'closed');
        const dayPMs = dayJobs.filter(j => j.jobType === 'PM' && j.status === 'closed');
        const dayRepairMinutes = dayBreakdowns.reduce((sum, job) => sum + (Number(job.downtimeMinutes) || 0), 0);
        const dayMTTR = dayBreakdowns.length > 0 ? Math.round(dayRepairMinutes / dayBreakdowns.length) : 0;
        const activeDies = new Set(dayJobs.filter(j => j.isScheduledForProduction).map(j => j.dieId));
        const activeCount = Math.max(activeDies.size, 1);
        const dayRunningMinutes = Math.max((480 * activeCount) - dayRepairMinutes, 0);
        const dayMTBF = dayBreakdowns.length > 0 ? Math.round(dayRunningMinutes / dayBreakdowns.length) : 0;

        trend.dates.push(dateStr);
        trend.labels.push(dateStr ? dateStr.slice(5) : '');
        trend.mttrSeries.push(dayMTTR);
        trend.mtbfSeries.push(dayMTBF);
        trend.breakdownSeries.push(dayBreakdowns.length);
        trend.repairMinutesSeries.push(dayRepairMinutes);
        trend.pmSeries.push(dayPMs.length);
    });

    return {
        range: {
            startDate: startDate || null,
            endDate: endDate || null,
            hasDateFilter,
            trendStartDate: datesToPlot[0] || null,
            trendEndDate: datesToPlot[datesToPlot.length - 1] || null
        },
        overall: {
            totalJobs: filteredJobs.length,
            totalClosedJobs: closedJobs.length,
            totalBreakdowns: breakdowns.length,
            totalPMs: pmClosed.length,
            totalRepairMinutes,
            avgMTTR,
            avgMTBF
        },
        byDept,
        trend,
        topBadActors
    };
}

function getDieMasterData(startDate = null, endDate = null) {
    const allJobs = getAllJobs();
    const filteredJobs = (startDate || endDate) ? allJobs.filter(j => isDateInRange(getJobDate(j), startDate, endDate)) : allJobs;
    const closedBreakdowns = filteredJobs.filter(j => j.status === 'closed' && j.jobType === 'BM');
    const analysisDays = getAnalysisDays(filteredJobs, startDate, endDate);
    const dieStats = {};

    closedBreakdowns.forEach(job => {
        if (!dieStats[job.dieId]) {
            dieStats[job.dieId] = {
                dieId: job.dieId,
                partName: job.partName,
                partNumber: job.partNumber,
                model: job.model,
                breakdownCount: 0,
                totalRepairMinutes: 0
            };
        }
        dieStats[job.dieId].breakdownCount += 1;
        dieStats[job.dieId].totalRepairMinutes += Number(job.downtimeMinutes) || 0;
    });

    return Object.values(dieStats).map(item => {
        const mttrEstimate = item.breakdownCount > 0 ? Math.round(item.totalRepairMinutes / item.breakdownCount) : 0;
        const mtbfEstimate = item.breakdownCount > 0 ? Math.round(Math.max((analysisDays * 480) - item.totalRepairMinutes, 0) / item.breakdownCount) : 0;
        return { ...item, mttrEstimate, mtbfEstimate };
    }).sort((a, b) => {
        if (a.mtbfEstimate !== b.mtbfEstimate) return a.mtbfEstimate - b.mtbfEstimate;
        return b.breakdownCount - a.breakdownCount;
    });
}
