// --- data_engine.js (DMS 4.0 KPI Engine - Bugfixed: Google Sheet, Timezone, Closed-date KPI) ---
// ใช้ localStorage เป็น cache และ sync กับ Google Sheet ผ่าน Apps Script

const DMS_STORAGE_KEY = 'dms_jobs';
const DMS_SHEET_API_KEY = 'dms_sheet_api_url';
const DMS_DEFAULT_SHEET_API_URL = 'https://script.google.com/macros/s/AKfycbyneqZah0eShidCeljYAdX5WVQlJSIVN52AtdWaAk7Hj-7_MbKMxhIoqMHKaSA9muXr0g/exec';
// โรงงานใช้งานเวลาไทยเป็นหลัก; ใช้สำหรับแปลงค่า ISO UTC จาก Google Sheet เช่น 2026-06-28T17:00:00.000Z => 2026-06-29
const DMS_TIMEZONE_OFFSET_MINUTES = 7 * 60;
const DMS_MAX_REPAIR_MINUTES = 3 * 24 * 60; // 3 วัน = 4,320 นาที ใช้กัน KPI เพี้ยน

function getDmsSheetApiUrl() {
    return (localStorage.getItem(DMS_SHEET_API_KEY) || DMS_DEFAULT_SHEET_API_URL || '').trim();
}

function setDmsSheetApiUrl(url) {
    const clean = String(url || '').trim();
    if (clean) localStorage.setItem(DMS_SHEET_API_KEY, clean);
    else localStorage.removeItem(DMS_SHEET_API_KEY);
}

function isDmsCloudEnabled() {
    return Boolean(getDmsSheetApiUrl());
}

function pad2(value) {
    return String(value).padStart(2, '0');
}

function getLocalDateString(dateObj) {
    if (!dateObj || isNaN(dateObj.getTime())) return null;
    return `${dateObj.getFullYear()}-${pad2(dateObj.getMonth() + 1)}-${pad2(dateObj.getDate())}`;
}

function getLocalDateTimeString(dateObj) {
    if (!dateObj || isNaN(dateObj.getTime())) return null;
    return `${dateObj.getFullYear()}-${pad2(dateObj.getMonth() + 1)}-${pad2(dateObj.getDate())}T${pad2(dateObj.getHours())}:${pad2(dateObj.getMinutes())}:${pad2(dateObj.getSeconds())}`;
}

function hasExplicitTimezone(text) {
    return /[zZ]$|[+-]\d{2}:?\d{2}$/.test(String(text || '').trim());
}

function getConfiguredTimezoneDate(dateObj) {
    if (!dateObj || isNaN(dateObj.getTime())) return null;
    return new Date(dateObj.getTime() + DMS_TIMEZONE_OFFSET_MINUTES * 60 * 1000);
}

function getConfiguredDateString(dateObj) {
    const shifted = getConfiguredTimezoneDate(dateObj);
    if (!shifted) return null;
    return `${shifted.getUTCFullYear()}-${pad2(shifted.getUTCMonth() + 1)}-${pad2(shifted.getUTCDate())}`;
}

function getConfiguredDateTimeString(dateObj) {
    const shifted = getConfiguredTimezoneDate(dateObj);
    if (!shifted) return null;
    return `${shifted.getUTCFullYear()}-${pad2(shifted.getUTCMonth() + 1)}-${pad2(shifted.getUTCDate())}T${pad2(shifted.getUTCHours())}:${pad2(shifted.getUTCMinutes())}:${pad2(shifted.getUTCSeconds())}`;
}

function getLocalISOString() {
    return getLocalDateTimeString(new Date());
}

function getLocalDatetimeInputValue() {
    return getLocalISOString().slice(0, 16);
}

function parseNumber(value, fallback = 0) {
    if (value === null || value === undefined || value === '') return fallback;
    if (typeof value === 'number') return Number.isFinite(value) ? value : fallback;
    const clean = String(value).replace(/,/g, '').trim();
    const num = Number(clean);
    return Number.isFinite(num) ? num : fallback;
}

function parseBoolean(value, fallback = true) {
    if (value === null || value === undefined || value === '') return fallback;
    if (typeof value === 'boolean') return value;
    const text = String(value).trim().toLowerCase();
    if (['true', '1', 'yes', 'y'].includes(text)) return true;
    if (['false', '0', 'no', 'n'].includes(text)) return false;
    return fallback;
}

function normalizeRepairSiteType(value, jobType = 'BM') {
    const raw = String(value || '').trim().toLowerCase().replace(/\s+/g, '_').replace(/-/g, '_');

    if (['on_site', 'onsite', 'line', 'line_stop', 'front_machine', 'machine', 'หน้าเครื่อง', 'ซ่อมหน้าเครื่อง'].includes(raw)) {
        return 'on_site';
    }

    if (['no_site', 'nosite', 'off_site', 'offline', 'in_shop', 'workshop', 'department', 'แผนก', 'ซ่อมในแผนก'].includes(raw)) {
        return 'no_site';
    }

    // Backward compatibility: old BM jobs had no repairSiteType. Treat them as On Site so existing KPI data still appears.
    return String(jobType || '').toUpperCase() === 'BM' ? 'on_site' : 'not_applicable';
}

function getRepairSiteLabel(repairSiteType) {
    if (repairSiteType === 'on_site') return 'BM On Site';
    if (repairSiteType === 'no_site') return 'BM No Site';
    return '-';
}

function parseDateTimeValue(value) {
    if (!value) return null;
    if (value instanceof Date) return isNaN(value.getTime()) ? null : value;

    const text = String(value).trim();
    if (!text) return null;

    // Date only: keep as local date, not UTC.
    let match = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (match) {
        return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 0, 0, 0);
    }

    // Local datetime from form or Sheet: yyyy-mm-dd HH:mm[:ss] or yyyy-mm-ddTHH:mm[:ss] with no timezone.
    match = text.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?$/);
    if (match) {
        return new Date(
            Number(match[1]),
            Number(match[2]) - 1,
            Number(match[3]),
            Number(match[4]),
            Number(match[5]),
            Number(match[6] || 0)
        );
    }

    // ISO with timezone/Z. Browser converts to user's local timezone.
    const parsed = new Date(text);
    return isNaN(parsed.getTime()) ? null : parsed;
}

function toLocalDateOnly(value) {
    if (!value) return null;
    if (value instanceof Date) return getLocalDateString(value);

    const text = String(value).trim();
    if (!text) return null;

    // Only a date. Do not pass through Date() because yyyy-mm-dd is treated as UTC by JS.
    if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;

    const d = parseDateTimeValue(text);
    if (!d) return null;
    return hasExplicitTimezone(text) ? getConfiguredDateString(d) : getLocalDateString(d);
}

function toLocalDateTimeOnly(value) {
    if (!value) return null;
    if (value instanceof Date) return getLocalDateTimeString(value);
    const text = String(value).trim();
    const d = parseDateTimeValue(text);
    if (!d) return null;
    return hasExplicitTimezone(text) ? getConfiguredDateTimeString(d) : getLocalDateTimeString(d);
}

// Backward-compatible alias used by old pages.
function extractDateString(value) {
    return toLocalDateOnly(value);
}

function parseLocalDate(dateStr) {
    const clean = toLocalDateOnly(dateStr);
    if (!clean) return null;
    const [year, month, day] = clean.split('-').map(Number);
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

function getJobReportDate(job = {}) {
    // Phase 1: reportDate is the main date for Asakai/Dashboard/KPI filtering.
    // Keep old data compatible by falling back to plannedDate -> closedAt/endTime -> requestAt.
    return toLocalDateOnly(job.reportDate)
        || toLocalDateOnly(job.plannedDate)
        || toLocalDateOnly(job.closedAt)
        || toLocalDateOnly(job.endTime)
        || toLocalDateOnly(job.requestAt)
        || toLocalDateOnly(job.updatedAt)
        || getLocalDateString(new Date());
}

function getJobDateByMode(job = {}, mode = 'report') {
    const dateMode = String(mode || 'report').toLowerCase();
    if (dateMode === 'request' || dateMode === 'requestat') {
        return toLocalDateOnly(job.requestAt) || getJobReportDate(job);
    }
    if (dateMode === 'closed' || dateMode === 'closedat') {
        return toLocalDateOnly(job.closedAt) || toLocalDateOnly(job.endTime) || getJobReportDate(job);
    }
    if (dateMode === 'planned' || dateMode === 'planneddate') {
        return toLocalDateOnly(job.plannedDate) || getJobReportDate(job);
    }
    if (dateMode === 'updated' || dateMode === 'updatedat') {
        return toLocalDateOnly(job.updatedAt) || getJobReportDate(job);
    }
    return getJobReportDate(job);
}

function isDateInRangeByMode(job, startDate, endDate, dateMode = 'report') {
    return isDateInRange(getJobDateByMode(job, dateMode), startDate, endDate);
}

// Public function used by pages/KPI. Closed jobs are reported by closedAt/endTime first.
function getJobDate(job) {
    return getJobReportDate(job);
}

// Date used for daily incoming job bars. Prefer reportDate because it is the Asakai/work date.
// This prevents backfilled jobs entered later from moving to the wrong month.
function getJobIncomingDate(job = {}) {
    return toLocalDateOnly(job.reportDate)
        || toLocalDateOnly(job.plannedDate)
        || toLocalDateOnly(job.requestAt)
        || toLocalDateOnly(job.createdAt)
        || getLocalDateString(new Date());
}

// Date used for completed BM/PM bars. Do not use reportDate here; otherwise
// jobs that start and finish on different days look like they closed immediately.
function getJobClosedDate(job = {}) {
    if (String(job.status || '').toLowerCase() !== 'closed') return null;
    return toLocalDateOnly(job.closedAt)
        || toLocalDateOnly(job.endTime)
        || null;
}

function compareDateString(a, b) {
    const da = toLocalDateOnly(a);
    const db = toLocalDateOnly(b);
    if (!da || !db) return null;
    if (da < db) return -1;
    if (da > db) return 1;
    return 0;
}

function isJobPendingOnDate(job = {}, dateStr) {
    const incomingDate = getJobIncomingDate(job);
    if (!incomingDate || !dateStr || incomingDate > dateStr) return false;

    const closedDate = getJobClosedDate(job);
    // If not closed yet, it remains pending after the incoming date.
    if (!closedDate) return true;

    // Pending through days before the closed date. Closed date itself is counted as completed, not pending.
    return closedDate > dateStr;
}

function minutesBetween(startValue, endValue) {
    const start = parseDateTimeValue(startValue);
    const end = parseDateTimeValue(endValue);
    if (!start || !end) return null;
    const diff = Math.round((end.getTime() - start.getTime()) / 60000);
    return diff >= 0 ? diff : null;
}

function calculateJobDowntimeMinutes(job) {
    if (!job) return null;

    let diff = minutesBetween(job.startTime, job.endTime || job.closedAt);

    // If the card was closed directly from Kanban, old data may have startTime=endTime.
    // Use requestAt as a fallback so the Dashboard does not show a false 0-minute BM.
    if ((diff === null || diff === 0) && job.requestAt && (job.endTime || job.closedAt)) {
        const fallbackDiff = minutesBetween(job.requestAt, job.endTime || job.closedAt);
        if (fallbackDiff !== null && fallbackDiff > diff) diff = fallbackDiff;
    }

    return diff;
}

function parseEditHistory(value) {
    if (!value) return [];
    if (Array.isArray(value)) return value;
    try {
        const parsed = JSON.parse(String(value));
        return Array.isArray(parsed) ? parsed : [];
    } catch (err) {
        return [];
    }
}

function isValidRepairDuration(job) {
    const mins = parseNumber(job && job.downtimeMinutes, 0);
    return mins >= 0 && mins <= DMS_MAX_REPAIR_MINUTES;
}

function getJobDataIssues(job = {}) {
    const issues = [];
    const mins = parseNumber(job.downtimeMinutes, 0);
    const start = parseDateTimeValue(job.startTime);
    const end = parseDateTimeValue(job.endTime || job.closedAt);

    if (!toLocalDateOnly(job.reportDate)) issues.push('ไม่มีวันที่รายงาน');
    if (!job.productionLine) issues.push('ไม่มีไลน์ผลิต');
    if (!job.partNumber) issues.push('ไม่มี Part Number');
    if (job.jobType === 'BM' && !job.repairSiteType) issues.push('ไม่มีประเภท BM On Site/No Site');
    if (job.status === 'closed' && job.jobType === 'BM' && mins > DMS_MAX_REPAIR_MINUTES) issues.push('เวลาซ่อมเกิน 3 วัน');
    if (job.status === 'closed' && start && end && end.getTime() < start.getTime()) issues.push('เวลาจบงานก่อนเวลาเริ่มงาน');

    const requestMonth = toLocalDateOnly(job.requestAt)?.slice(0, 7);
    const reportMonth = toLocalDateOnly(job.reportDate)?.slice(0, 7);
    if (requestMonth && reportMonth && requestMonth !== reportMonth) issues.push('เดือนที่บันทึกกับเดือนรายงานไม่ตรงกัน');

    return issues;
}

function getDataQualityIssues(startDate = null, endDate = null, options = {}) {
    const dateMode = options.dateMode || 'report';
    return getAllJobs()
        .filter(job => !(startDate || endDate) || isDateInRangeByMode(job, startDate, endDate, dateMode))
        .map(job => ({ job, issues: getJobDataIssues(job) }))
        .filter(item => item.issues.length > 0);
}

function normalizeJob(job = {}) {
    const requestAt = toLocalDateTimeOnly(job.requestAt || job.time) || getLocalISOString();
    const closedAt = toLocalDateTimeOnly(job.closedAt) || null;
    const endTime = toLocalDateTimeOnly(job.endTime) || null;
    const startTime = toLocalDateTimeOnly(job.startTime) || null;
    const plannedDate = toLocalDateOnly(job.plannedDate)
        || toLocalDateOnly(requestAt)
        || toLocalDateOnly(closedAt)
        || getLocalDateString(new Date());
    const reportDate = toLocalDateOnly(job.reportDate)
        || plannedDate
        || toLocalDateOnly(closedAt)
        || toLocalDateOnly(endTime)
        || toLocalDateOnly(requestAt)
        || getLocalDateString(new Date());

    const rawStatus = String(job.status || 'pending').trim().toLowerCase();
    const status = rawStatus === 'done' ? 'closed' : rawStatus;
    const jobType = String(job.jobType || (job.dept === 'PM' ? 'PM' : 'BM')).toUpperCase();
    const repairSiteType = normalizeRepairSiteType(job.repairSiteType || job.siteType || job.bmSiteType || job.repairLocation, jobType);

    const normalized = {
        jobId: String(job.jobId || job.id || `REQ-${Date.now()}`),
        requestAt,
        plannedDate,
        reportDate,
        sap: job.sap || job.sapRef || '',
        dept: String(job.dept || 'UNKNOWN-DEPT').toUpperCase(),
        dieId: String(job.dieId || job.assetId || 'UNKNOWN-DIE').toUpperCase(),
        partName: job.partName || job.part || job.part_name || 'ไม่ระบุชื่อ Part',
        partNumber: String(job.partNumber || job.partNo || job.part_number || '').toUpperCase(),
        model: String(job.model || job.modelName || '').toUpperCase(),
        productionLine: String(job.productionLine || job.line || job.lineName || '').toUpperCase(),
        defect: job.defect || job.problemDesc || job.problem || '',
        partStock: job.partStock || '',
        priority: job.priority || 'ปกติ',
        status,
        assignedTech: job.assignedTech || null,
        startTime,
        endTime,
        repairMethod: job.repairMethod || job.repairCategory || null,
        rootCause: job.rootCause || job.repairDetail || null,
        downtimeMinutes: parseNumber(job.downtimeMinutes, null),
        jobType,
        repairSiteType,
        closedBy: job.closedBy || null,
        closedAt,
        isScheduledForProduction: parseBoolean(job.isScheduledForProduction, true),
        shiftPlannedMinutes: parseNumber(job.shiftPlannedMinutes, 480),
        updatedAt: toLocalDateTimeOnly(job.updatedAt) || job.updatedAt || null,
        updatedBy: job.updatedBy || null,
        editHistory: Array.isArray(job.editHistory) ? job.editHistory : parseEditHistory(job.editHistory)
    };

    if (normalized.status !== 'closed') {
        normalized.endTime = null;
        normalized.closedAt = null;
        normalized.closedBy = null;
        normalized.downtimeMinutes = null;
    }

    if (normalized.status === 'closed') {
        const calculated = calculateJobDowntimeMinutes(normalized);
        if (normalized.downtimeMinutes === null || normalized.downtimeMinutes <= 0) {
            normalized.downtimeMinutes = calculated !== null ? calculated : 0;
        }
        normalized.endTime = normalized.endTime || normalized.closedAt || null;
        normalized.closedAt = normalized.closedAt || normalized.endTime || null;
    }

    if (!Number.isFinite(normalized.shiftPlannedMinutes) || normalized.shiftPlannedMinutes <= 0) {
        normalized.shiftPlannedMinutes = 480;
    }

    return normalized;
}

function compareJobFreshness(a, b) {
    const aTime = parseDateTimeValue(a.updatedAt || a.closedAt || a.endTime || a.requestAt);
    const bTime = parseDateTimeValue(b.updatedAt || b.closedAt || b.endTime || b.requestAt);
    const av = aTime ? aTime.getTime() : 0;
    const bv = bTime ? bTime.getTime() : 0;
    return av - bv;
}

function mergeJobArrays(...arrays) {
    const merged = new Map();
    arrays.flat().filter(Boolean).map(normalizeJob).forEach(job => {
        const existing = merged.get(job.jobId);
        if (!existing || compareJobFreshness(existing, job) <= 0) merged.set(job.jobId, job);
    });
    return [...merged.values()];
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

function saveJobsToLocal(jobs) {
    const normalized = (jobs || []).map(normalizeJob);
    localStorage.setItem(DMS_STORAGE_KEY, JSON.stringify(normalized));
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
                saveJobsToLocal(mergeJobArrays(localJobs, cloudJobs));
                if (typeof showToast === 'function') showToast('โหลดข้อมูลจาก Google Sheet แล้ว', 'success');
            } else if (typeof showToast === 'function') {
                showToast('รูปแบบข้อมูลจาก Google Sheet ไม่ถูกต้อง', 'error');
            }
        } catch (err) {
            console.warn('DMS cloud pull parse failed:', err);
            if (typeof showToast === 'function') showToast('อ่านข้อมูลจาก Google Sheet ไม่สำเร็จ', 'error');
        } finally {
            delete window[callbackName];
            const tag = document.getElementById(callbackName);
            if (tag) tag.remove();
        }
    };

    const sep = apiUrl.includes('?') ? '&' : '?';
    const script = document.createElement('script');
    script.id = callbackName;
    script.src = `${apiUrl}${sep}action=list&callback=${callbackName}&_=${Date.now()}`;
    script.onerror = () => {
        if (typeof showToast === 'function') showToast('โหลดข้อมูลจาก Google Sheet ไม่สำเร็จ', 'error');
        delete window[callbackName];
        script.remove();
    };
    document.body.appendChild(script);
}

function saveJob(jobObj) {
    const jobs = getAllJobs();
    const normJob = normalizeJob(jobObj);
    const index = jobs.findIndex(j => j.jobId === normJob.jobId);

    if (index !== -1) jobs[index] = normJob;
    else jobs.push(normJob);

    localStorage.setItem(DMS_STORAGE_KEY, JSON.stringify(jobs.map(normalizeJob)));
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
    if (startDate && !endDate) return [toLocalDateOnly(startDate)].filter(Boolean);
    if (!startDate && endDate) return [toLocalDateOnly(endDate)].filter(Boolean);

    const month = getCurrentMonthBounds();
    return getDateRangeList(month.startDate, month.endDate);
}

function getAnalysisDays(filteredJobs, startDate, endDate) {
    if (startDate && endDate) return Math.max(getDateRangeList(startDate, endDate).length, 1);
    const uniqueDates = new Set(filteredJobs.map(getJobDate).filter(Boolean));
    return Math.max(uniqueDates.size, 1);
}

function getShiftMinutesForDay(dayJobs) {
    const activeDies = new Set(dayJobs.filter(j => j.isScheduledForProduction).map(j => j.dieId));
    const activeCount = Math.max(activeDies.size, 1);
    const shift = dayJobs.reduce((max, job) => Math.max(max, parseNumber(job.shiftPlannedMinutes, 480)), 480);
    return activeCount * shift;
}

function fetchAndCalculateKPIs(startDate = null, endDate = null, options = {}) {
    const allJobs = getAllJobs();
    const dateMode = options.dateMode || 'report';
    const hasDateFilter = Boolean(startDate || endDate);
    const filteredJobs = hasDateFilter ? allJobs.filter(j => isDateInRangeByMode(j, startDate, endDate, dateMode)) : allJobs;

    const closedJobs = filteredJobs.filter(j => j.status === 'closed');
    const breakdowns = closedJobs.filter(j => j.jobType === 'BM');
    const kpiBreakdowns = closedJobs.filter(j => isClosedBmOnSite(j) && isValidRepairDuration(j));
    const pmClosed = closedJobs.filter(j => j.jobType === 'PM');

    const totalRepairMinutes = kpiBreakdowns.reduce((sum, job) => sum + parseNumber(job.downtimeMinutes, 0), 0);
    const avgMTTR = kpiBreakdowns.length > 0 ? Math.round(totalRepairMinutes / kpiBreakdowns.length) : 0;

    const uniqueDates = [...new Set(kpiBreakdowns.map(job => getJobDateByMode(job, dateMode)).filter(Boolean))];
    let sumDailyMTBF = 0;
    uniqueDates.forEach(dateStr => {
        const dayBreakdowns = kpiBreakdowns.filter(j => getJobDateByMode(j, dateMode) === dateStr);
        const dayJobs = filteredJobs.filter(j => getJobDateByMode(j, dateMode) === dateStr);
        const dailyRepairMinutes = dayBreakdowns.reduce((sum, job) => sum + parseNumber(job.downtimeMinutes, 0), 0);
        const runningMinutes = Math.max(getShiftMinutesForDay(dayJobs) - dailyRepairMinutes, 0);
        sumDailyMTBF += dayBreakdowns.length > 0 ? Math.round(runningMinutes / dayBreakdowns.length) : 0;
    });
    const avgMTBF = uniqueDates.length > 0 ? Math.round(sumDailyMTBF / uniqueDates.length) : 0;

    const depts = ['S-D', 'L-D', 'P-D'];
    const byDept = {};
    depts.forEach(dept => {
        const deptJobs = filteredJobs.filter(j => j.dept === dept);
        const deptBreakdowns = breakdowns.filter(j => j.dept === dept);
        const deptKpiBreakdowns = kpiBreakdowns.filter(j => j.dept === dept);
        const deptRepairMinutes = deptKpiBreakdowns.reduce((sum, job) => sum + parseNumber(job.downtimeMinutes, 0), 0);
        byDept[dept] = {
            totalJobs: deptJobs.length,
            breakdowns: deptBreakdowns.length,
            repairMinutes: deptRepairMinutes,
            mttr: deptKpiBreakdowns.length > 0 ? Math.round(deptRepairMinutes / deptKpiBreakdowns.length) : 0
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
        dieStats[job.dieId].totalRepairMinutes += parseNumber(job.downtimeMinutes, 0);
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

    const trend = {
        labels: [],
        dates: [],
        mttrSeries: [],
        mtbfSeries: [],
        breakdownSeries: [],
        repairMinutesSeries: [],
        pmSeries: [],
        incomingSeries: [],
        pendingSeries: []
    };
    const datesToPlot = getTrendDates(startDate, endDate);

    datesToPlot.forEach(dateStr => {
        // Daily job flow uses separate dates by purpose:
        // - Incoming: reportDate/plannedDate/requestAt
        // - Completed BM/PM: closedAt/endTime
        // - Pending: entered before this day and not yet closed before this day
        const dayIncomingJobs = allJobs.filter(j => getJobIncomingDate(j) === dateStr);
        const dayClosedJobs = allJobs.filter(j => getJobClosedDate(j) === dateStr);
        const dayPendingJobs = allJobs.filter(j => isJobPendingOnDate(j, dateStr));

        const dayBreakdowns = dayClosedJobs.filter(j => j.jobType === 'BM');
        const dayKpiBreakdowns = dayClosedJobs.filter(j => isClosedBmOnSite(j) && isValidRepairDuration(j));
        const dayPMs = dayClosedJobs.filter(j => j.jobType === 'PM');
        const dayRepairMinutes = dayKpiBreakdowns.reduce((sum, job) => sum + parseNumber(job.downtimeMinutes, 0), 0);
        const dayMTTR = dayKpiBreakdowns.length > 0 ? Math.round(dayRepairMinutes / dayKpiBreakdowns.length) : 0;

        const dayShiftSourceJobs = dayIncomingJobs.length || dayClosedJobs.length ? [...dayIncomingJobs, ...dayClosedJobs] : dayPendingJobs;
        const dayRunningMinutes = Math.max(getShiftMinutesForDay(dayShiftSourceJobs) - dayRepairMinutes, 0);
        const dayMTBF = dayKpiBreakdowns.length > 0 ? Math.round(dayRunningMinutes / dayKpiBreakdowns.length) : 0;

        trend.dates.push(dateStr);
        trend.labels.push(dateStr ? dateStr.slice(5) : '');
        trend.mttrSeries.push(dayMTTR);
        trend.mtbfSeries.push(dayMTBF);
        trend.incomingSeries.push(dayIncomingJobs.length);
        trend.breakdownSeries.push(dayBreakdowns.length);
        trend.repairMinutesSeries.push(dayRepairMinutes);
        trend.pmSeries.push(dayPMs.length);
        trend.pendingSeries.push(dayPendingJobs.length);
    });

    return {
        range: {
            startDate: startDate || null,
            endDate: endDate || null,
            hasDateFilter,
            dateMode,
            trendStartDate: datesToPlot[0] || null,
            trendEndDate: datesToPlot[datesToPlot.length - 1] || null
        },
        overall: {
            totalJobs: filteredJobs.length,
            totalClosedJobs: closedJobs.length,
            totalBreakdowns: breakdowns.length,
            totalKpiBreakdowns: kpiBreakdowns.length,
            totalPMs: pmClosed.length,
            totalRepairMinutes,
            avgMTTR,
            avgMTBF,
            anomalyJobs: getDataQualityIssues(startDate, endDate, { dateMode }).length
        },
        byDept,
        trend,
        topBadActors
    };
}

function isClosedBmOnSite(job) {
    return job && job.status === 'closed' && job.jobType === 'BM' && normalizeRepairSiteType(job.repairSiteType, job.jobType) === 'on_site';
}

function isClosedBmNoSite(job) {
    return job && job.status === 'closed' && job.jobType === 'BM' && normalizeRepairSiteType(job.repairSiteType, job.jobType) === 'no_site';
}

function getKpiAnalysisJobs(startDate = null, endDate = null, options = {}) {
    const mode = options.mode || 'bm_on_site';
    const line = String(options.productionLine || options.line || '').toUpperCase();
    const dept = String(options.dept || '').toUpperCase();

    return getAllJobs().filter(job => {
        if ((startDate || endDate) && !isDateInRangeByMode(job, startDate, endDate, options.dateMode || 'report')) return false;
        if (line && job.productionLine !== line) return false;
        if (dept && job.dept !== dept) return false;

        if (mode === 'bm_on_site') return isClosedBmOnSite(job) && isValidRepairDuration(job);
        if (mode === 'bm_no_site') return isClosedBmNoSite(job);
        if (mode === 'bm_all') return job.status === 'closed' && job.jobType === 'BM';
        if (mode === 'pm') return job.status === 'closed' && job.jobType === 'PM';
        if (mode === 'all_closed') return job.status === 'closed';

        return isClosedBmOnSite(job);
    });
}

function getDieMasterData(startDate = null, endDate = null) {
    const allJobs = getAllJobs();
    const filteredJobs = (startDate || endDate) ? allJobs.filter(j => isDateInRangeByMode(j, startDate, endDate, 'report')) : allJobs;
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
        dieStats[job.dieId].totalRepairMinutes += parseNumber(job.downtimeMinutes, 0);
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

window.addEventListener('DOMContentLoaded', () => {
    if (isDmsCloudEnabled()) {
        setTimeout(() => pullJobsFromSheet(), 300);
    }
});
