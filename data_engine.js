// --- data_engine.js (KPI Engine กลางของระบบ V5 - Real Data & Advanced Date Filter) ---

function getLocalDateString(dateObj) {
    if (!dateObj || isNaN(dateObj.getTime())) return null;
    const year = dateObj.getFullYear();
    const month = String(dateObj.getMonth() + 1).padStart(2, '0');
    const day = String(dateObj.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function getLocalISOString() {
    const tzoffset = (new Date()).getTimezoneOffset() * 60000; 
    const localISOTime = (new Date(Date.now() - tzoffset)).toISOString().slice(0, -1);
    return localISOTime; 
}

function getAllJobs() {
    try {
        const jobs = JSON.parse(localStorage.getItem('dms_jobs'));
        return Array.isArray(jobs) ? jobs.map(normalizeJob) : [];
    } catch (e) {
        return [];
    }
}

function normalizeJob(job) {
    const defaultDate = getLocalISOString(); 
    
    let plannedD = job.plannedDate;
    if(!plannedD && job.requestAt) {
         plannedD = job.requestAt.split('T')[0];
    } else if (!plannedD) {
         plannedD = defaultDate.split('T')[0];
    }

    return {
        jobId: job.jobId || job.id || `JOB-${Date.now()}`,
        requestAt: job.requestAt || job.time || defaultDate,
        plannedDate: plannedD, 
        dieId: job.dieId || 'UNKNOWN-DIE',
        dept: job.dept || 'UNKNOWN-DEPT',
        partName: job.partName || 'Unknown Part',
        defect: job.defect || '',
        priority: job.priority || 'ปกติ',
        status: job.status || 'pending',
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
        shiftPlannedMinutes: job.shiftPlannedMinutes || 480
    };
}

// ฟังก์ชันเช็คว่าวันที่อยู่ในช่วงที่เลือกหรือไม่
function isDateInRange(dateStr, startDate, endDate) {
    if (!startDate && !endDate) return true;
    const checkDate = new Date(dateStr);
    checkDate.setHours(0,0,0,0);
    
    if (startDate) {
        const start = new Date(startDate);
        start.setHours(0,0,0,0);
        if (checkDate < start) return false;
    }
    if (endDate) {
        const end = new Date(endDate);
        end.setHours(0,0,0,0);
        if (checkDate > end) return false;
    }
    return true;
}

// ฟังก์ชันหลักสำหรับการดึงและคำนวณ KPI ทั้งหมด
function fetchAndCalculateKPIs(startDate = null, endDate = null) {
    const allJobs = getAllJobs();
    
    // ดึงวันที่หลักของงาน (ให้ความสำคัญกับ plannedDate ก่อน)
    const getJobDate = (j) => j.plannedDate || (j.closedAt ? j.closedAt.split('T')[0] : j.requestAt.split('T')[0]);

    // 1. กรอง Job เฉพาะที่อยู่ในช่วงวันที่ระบุ
    const filteredJobs = allJobs.filter(j => isDateInRange(getJobDate(j), startDate, endDate));

    const closedJobs = filteredJobs.filter(j => j.status === 'closed');
    const breakdowns = closedJobs.filter(j => j.jobType === 'BM');
    
    // 2. คำนวณ Overall Metrics
    let totalRepairMinutes = 0;
    breakdowns.forEach(j => { totalRepairMinutes += j.downtimeMinutes || 0; });
    const avgMTTR = breakdowns.length > 0 ? Math.round(totalRepairMinutes / breakdowns.length) : 0;
    
    const uniqueDates = [...new Set(breakdowns.map(getJobDate))];
    let sumDailyMTBF = 0;
    uniqueDates.forEach(dStr => {
        const dJobs = breakdowns.filter(j => getJobDate(j) === dStr);
        let dailyMins = 0;
        dJobs.forEach(j => dailyMins += j.downtimeMinutes || 0);
        
        const activeDies = new Set();
        filteredJobs.forEach(j => {
            if (getJobDate(j) === dStr && j.isScheduledForProduction) activeDies.add(j.dieId);
        });
        const activeCount = activeDies.size > 0 ? activeDies.size : 1;
        let runningMins = (480 * activeCount) - dailyMins;
        if(runningMins < 0) runningMins = 0;
        
        sumDailyMTBF += dJobs.length > 0 ? Math.round(runningMins / dJobs.length) : 0;
    });
    const avgMTBF = uniqueDates.length > 0 ? Math.round(sumDailyMTBF / uniqueDates.length) : 0;

    // 3. คำนวณ By Department
    const depts = ['S-D', 'L-D', 'P-D'];
    const byDept = {};
    depts.forEach(d => {
        const dJobs = breakdowns.filter(j => j.dept === d);
        let dMins = 0;
        dJobs.forEach(j => { dMins += j.downtimeMinutes || 0; });
        byDept[d] = {
            totalJobs: filteredJobs.filter(j => j.dept === d).length,
            breakdowns: dJobs.length,
            repairMinutes: dMins,
            mttr: dJobs.length > 0 ? Math.round(dMins / dJobs.length) : 0,
        };
    });

    // 4. คำนวณ Top Bad Actors
    const dieStats = {};
    breakdowns.forEach(j => {
        if (!dieStats[j.dieId]) dieStats[j.dieId] = { count: 0, mins: 0 };
        dieStats[j.dieId].count++;
        dieStats[j.dieId].mins += j.downtimeMinutes || 0;
    });
    
    const topBadActors = Object.keys(dieStats).map(k => {
        const count = dieStats[k].count;
        const mins = dieStats[k].mins;
        const estUptime = Math.max((15 * 480) - mins, 0); 
        return {
            dieId: k,
            breakdownCount: count,
            totalRepairMinutes: mins,
            mttrEstimate: count > 0 ? Math.round(mins / count) : 0,
            mtbfEstimate: count > 0 ? Math.round(estUptime / count) : 0
        };
    }).sort((a, b) => a.mtbfEstimate - b.mtbfEstimate).slice(0, 5);

    // 5. เตรียมข้อมูลกราฟ (Trend) 
    const trend = { labels: [], mttrSeries: [], mtbfSeries: [], breakdownSeries: [], repairMinutesSeries: [], pmSeries: [] };
    
    let datesToPlot = [];

    // --- ลอจิกการคำนวณแกน X วันที่ (แก้ไขใหม่) ---
    // กรณีที่ 1: เลือกทั้งจุดเริ่มต้น และจุดสิ้นสุด (เช่น เลือก 1 ถึง 5 ให้โชว์ 5 วันนั้น)
    if (startDate && endDate) {
        let currDate = new Date(startDate);
        const endD = new Date(endDate);
        while (currDate <= endD) {
            datesToPlot.push(getLocalDateString(currDate));
            currDate.setDate(currDate.getDate() + 1);
        }
    } 
    // กรณีที่ 2: เลือกแค่วันที่เริ่มต้นวันเดียว (เช่น เลือกวันที่ 5 ให้โชว์ตั้งแต่วันที่ 5 ไปจนถึง ปัจจุบัน หรือโชว์ย้อนหลังก็ได้)
    // เพื่อความเข้าใจง่าย ถ้าเลือกจุดเริ่มต้นจุดเดียว จะโชว์จากจุดนั้นไปข้างหน้า 30 วัน
    else if (startDate && !endDate) {
        const startD = new Date(startDate);
        for (let i = 0; i < 30; i++) {
            const d = new Date(startD);
            d.setDate(d.getDate() + i);
            datesToPlot.push(getLocalDateString(d));
        }
    } 
    // กรณีที่ 3: เลือกแค่วันที่สิ้นสุดวันเดียว (เช่น เลือกวันที่ 5 ให้โชว์ย้อนหลัง 30 วัน โดยวันที่ 5 เป็นวันสุดท้ายขวาสุด)
    else if (!startDate && endDate) {
        const endD = new Date(endDate);
        // ถอยหลังไป 29 วัน เพื่อรวมวันที่เลือกเป็น 30 วันพอดี (เรียงจากเก่าไปใหม่)
        for (let i = 29; i >= 0; i--) {
            const d = new Date(endD);
            d.setDate(d.getDate() - i);
            datesToPlot.push(getLocalDateString(d));
        }
    } 
    // กรณีที่ 4: ไม่ได้เลือกอะไรเลย โชว์ย้อนหลัง 30 วันนับจากวันนี้
    else {
        for (let i = 29; i >= 0; i--) {
            const d = new Date();
            d.setDate(d.getDate() - i);
            datesToPlot.push(getLocalDateString(d));
        }
    }

    // --- วนลูปสร้าง Data สำหรับกราฟตามวันที่จัดเตรียมไว้ ---
    datesToPlot.forEach(dateStr => {
        trend.labels.push(dateStr.slice(5)); // เอาแค่ MM-DD โชว์บนแกน X
        
        const dayJobs = allJobs.filter(j => getJobDate(j) === dateStr);
        const dBreakdowns = dayJobs.filter(j => j.jobType === 'BM' && j.status === 'closed');
        const dPMs = dayJobs.filter(j => j.jobType === 'PM' && j.status === 'closed');
        
        let dTotalMins = 0;
        dBreakdowns.forEach(j => dTotalMins += j.downtimeMinutes || 0);

        const dMttr = dBreakdowns.length > 0 ? Math.round(dTotalMins / dBreakdowns.length) : 0;
        
        const activeDies = new Set();
        dayJobs.forEach(j => { if(j.isScheduledForProduction) activeDies.add(j.dieId); });
        const activeCount = activeDies.size > 0 ? activeDies.size : 1;
        
        let dRunningMins = (480 * activeCount) - dTotalMins;
        if (dRunningMins < 0) dRunningMins = 0;
        const dMtbf = dBreakdowns.length > 0 ? Math.round(dRunningMins / dBreakdowns.length) : 0;

        trend.mttrSeries.push(dMttr);
        trend.mtbfSeries.push(dMtbf);
        trend.breakdownSeries.push(dBreakdowns.length);
        trend.repairMinutesSeries.push(dTotalMins);
        trend.pmSeries.push(dPMs.length);
    });

    return {
        overall: {
            totalJobs: filteredJobs.length,
            totalClosedJobs: closedJobs.length,
            totalBreakdowns: breakdowns.length,
            totalPMs: closedJobs.filter(j => j.jobType === 'PM').length,
            totalRepairMinutes,
            avgMTTR,
            avgMTBF
        },
        byDept,
        trend,
        topBadActors
    };
}

function saveJob(jobObj) {
    const jobs = getAllJobs();
    const index = jobs.findIndex(j => j.jobId === jobObj.jobId);
    
    const normJob = normalizeJob(jobObj);
    if (index !== -1) {
        jobs[index] = normJob;
    } else {
        jobs.push(normJob);
    }
    localStorage.setItem('dms_jobs', JSON.stringify(jobs));
}