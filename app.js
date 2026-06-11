/* ============================================================
   Carbon Footprint Tracker — Application Logic
   CSV-powered carbon calculator with data-driven insights
   ============================================================ */

(function () {
  'use strict';

  // ── State ──────────────────────────────────────────────
  const state = {
    csvData: [],
    currentStep: 0,
    totalSteps: 6,
    answers: {},
    results: null,
  };

  // ── DOM Cache ──────────────────────────────────────────
  const $ = (sel, ctx = document) => ctx.querySelector(sel);
  const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];

  // ── CSV Loading ────────────────────────────────────────
  async function loadCSV() {
    try {
      const response = await fetch('Carbon Emission.csv');
      const text = await response.text();
      return new Promise((resolve, reject) => {
        Papa.parse(text, {
          header: true,
          dynamicTyping: true,
          skipEmptyLines: true,
          complete: (results) => {
            state.csvData = results.data.filter(r => r.CarbonEmission != null && !isNaN(r.CarbonEmission));
            resolve(state.csvData);
          },
          error: reject,
        });
      });
    } catch (err) {
      console.error('Failed to load CSV:', err);
      return [];
    }
  }

  // ── Data Analysis Engine ───────────────────────────────
  const DataEngine = {
    /** Average emission for the full dataset */
    globalAverage() {
      const d = state.csvData;
      return d.reduce((s, r) => s + r.CarbonEmission, 0) / d.length;
    },

    /** Min / Max / Median */
    globalStats() {
      const vals = state.csvData.map(r => r.CarbonEmission).sort((a, b) => a - b);
      return {
        min: vals[0],
        max: vals[vals.length - 1],
        median: vals[Math.floor(vals.length / 2)],
        avg: this.globalAverage(),
        count: vals.length,
      };
    },

    /** Average emission grouped by a column */
    averageBy(column) {
      const groups = {};
      state.csvData.forEach(r => {
        const key = r[column];
        if (key == null || key === '') return;
        if (!groups[key]) groups[key] = { sum: 0, count: 0 };
        groups[key].sum += r.CarbonEmission;
        groups[key].count++;
      });
      const result = {};
      Object.entries(groups).forEach(([k, v]) => {
        result[k] = Math.round(v.sum / v.count);
      });
      return result;
    },

    /** Find percentile rank for a given emission value */
    percentile(emission) {
      const sorted = state.csvData.map(r => r.CarbonEmission).sort((a, b) => a - b);
      let count = 0;
      for (const v of sorted) {
        if (v < emission) count++;
        else break;
      }
      return Math.round((count / sorted.length) * 100);
    },

    /** Find similar profiles and return their avg emission */
    estimateEmission(answers) {
      // Build filter criteria with decreasing strictness
      const filters = [
        { col: 'Diet', val: answers.diet },
        { col: 'Transport', val: answers.transport },
        { col: 'Heating Energy Source', val: answers.heating },
        { col: 'Frequency of Traveling by Air', val: answers.airTravel },
        { col: 'Vehicle Type', val: answers.vehicleType },
        { col: 'How Often Shower', val: answers.shower },
        { col: 'Energy efficiency', val: answers.energyEfficiency },
        { col: 'Waste Bag Size', val: answers.wasteBagSize },
      ];

      let filtered = [...state.csvData];

      // Apply filters one by one, stop if too few matches
      for (const f of filters) {
        if (!f.val) continue;
        const next = filtered.filter(r => r[f.col] === f.val);
        if (next.length >= 15) {
          filtered = next;
        }
      }

      // Also apply numeric proximity filters
      if (answers.groceryBill) {
        const gb = answers.groceryBill;
        const numFiltered = filtered.filter(r =>
          r['Monthly Grocery Bill'] >= gb - 50 && r['Monthly Grocery Bill'] <= gb + 50
        );
        if (numFiltered.length >= 10) filtered = numFiltered;
      }

      if (answers.vehicleDistance) {
        const vd = answers.vehicleDistance;
        const numFiltered = filtered.filter(r => {
          const d = r['Vehicle Monthly Distance Km'];
          return d >= vd * 0.5 && d <= vd * 1.5;
        });
        if (numFiltered.length >= 10) filtered = numFiltered;
      }

      const avg = filtered.reduce((s, r) => s + r.CarbonEmission, 0) / filtered.length;
      return {
        emission: Math.round(avg),
        matchCount: filtered.length,
        matchedRecords: filtered,
      };
    },

    /** Breakdown by category — what contributes most */
    categoryBreakdown(answers) {
      const categories = {};

      // Diet impact
      const dietAvg = this.averageBy('Diet');
      const dietValues = Object.values(dietAvg);
      const dietMin = Math.min(...dietValues);
      const dietMax = Math.max(...dietValues);
      const userDietVal = dietAvg[answers.diet] || this.globalAverage();
      categories.diet = {
        label: 'Diet & Food',
        icon: '<i data-lucide="salad"></i>',
        value: userDietVal,
        min: dietMin,
        max: dietMax,
        userChoice: answers.diet,
        bestChoice: Object.entries(dietAvg).sort((a, b) => a[1] - b[1])[0],
      };

      // Transport
      const transportAvg = this.averageBy('Transport');
      const tValues = Object.values(transportAvg);
      categories.transport = {
        label: 'Transportation',
        icon: '<i data-lucide="car"></i>',
        value: transportAvg[answers.transport] || this.globalAverage(),
        min: Math.min(...tValues),
        max: Math.max(...tValues),
        userChoice: answers.transport,
        bestChoice: Object.entries(transportAvg).sort((a, b) => a[1] - b[1])[0],
      };

      // Energy
      const energyAvg = this.averageBy('Heating Energy Source');
      const eValues = Object.values(energyAvg);
      categories.energy = {
        label: 'Home Energy',
        icon: '<i data-lucide="zap"></i>',
        value: energyAvg[answers.heating] || this.globalAverage(),
        min: Math.min(...eValues),
        max: Math.max(...eValues),
        userChoice: answers.heating,
        bestChoice: Object.entries(energyAvg).sort((a, b) => a[1] - b[1])[0],
      };

      // Air Travel
      const airAvg = this.averageBy('Frequency of Traveling by Air');
      const aValues = Object.values(airAvg);
      categories.travel = {
        label: 'Air Travel',
        icon: '<i data-lucide="plane"></i>',
        value: airAvg[answers.airTravel] || this.globalAverage(),
        min: Math.min(...aValues),
        max: Math.max(...aValues),
        userChoice: answers.airTravel,
        bestChoice: Object.entries(airAvg).sort((a, b) => a[1] - b[1])[0],
      };

      // Waste
      const wasteAvg = this.averageBy('Waste Bag Size');
      const wValues = Object.values(wasteAvg);
      categories.waste = {
        label: 'Waste',
        icon: '<i data-lucide="recycle"></i>',
        value: wasteAvg[answers.wasteBagSize] || this.globalAverage(),
        min: Math.min(...wValues),
        max: Math.max(...wValues),
        userChoice: answers.wasteBagSize,
        bestChoice: Object.entries(wasteAvg).sort((a, b) => a[1] - b[1])[0],
      };

      // Energy efficiency
      const effAvg = this.averageBy('Energy efficiency');
      const efValues = Object.values(effAvg);
      categories.efficiency = {
        label: 'Energy Efficiency',
        icon: '<i data-lucide="home"></i>',
        value: effAvg[answers.energyEfficiency] || this.globalAverage(),
        min: Math.min(...efValues),
        max: Math.max(...efValues),
        userChoice: answers.energyEfficiency,
        bestChoice: Object.entries(effAvg).sort((a, b) => a[1] - b[1])[0],
      };

      return categories;
    },

    /** Generate personalized tips */
    generateInsights(answers, emission) {
      const insights = [];
      const categories = this.categoryBreakdown(answers);

      // Sort categories by potential savings (user value - best value)
      const ranked = Object.entries(categories)
        .map(([key, cat]) => ({
          key,
          ...cat,
          potential: cat.value - cat.min,
        }))
        .sort((a, b) => b.potential - a.potential);

      const tipTemplates = {
        diet: {
          transport: 'diet',
          tips: {
            omnivore: `Switching to a plant-based diet could significantly reduce your carbon footprint. Start with "Meatless Mondays" and gradually increase plant-based meals.`,
            pescatarian: `You're already doing better than average omnivores! Consider reducing fish consumption and adding more plant-based protein sources.`,
            vegetarian: `Great choice! To go further, try reducing dairy consumption and experimenting with vegan alternatives for milk and cheese.`,
            vegan: `Excellent! Your diet is among the lowest-impact. Focus on buying local and seasonal produce to further reduce food miles.`,
          },
        },
        transport: {
          tips: {
            private: `Private vehicles are a major emission source. Consider carpooling, using public transport for daily commutes, or switching to an electric/hybrid vehicle.`,
            public: `Good choice using public transport! To reduce further, consider cycling or walking for shorter distances.`,
            'walk/bicycle': `Amazing! Walking and cycling are the greenest transport options. Keep it up!`,
          },
        },
        energy: {
          tips: {
            coal: `Coal heating has the highest carbon impact. Consider switching to natural gas or electric heating powered by renewables.`,
            'natural gas': `Natural gas is cleaner than coal, but switching to electric heating (especially with renewable energy) would cut emissions further.`,
            wood: `Wood heating can be carbon-neutral if sourced sustainably. Consider supplementing with solar thermal or heat pumps.`,
            electricity: `If your electricity comes from renewables, this is a great choice! Consider installing solar panels for even lower impact.`,
          },
        },
        travel: {
          tips: {
            'very frequently': `Frequent flying is one of the largest individual emission sources. Consider video conferencing for business trips and train travel for shorter distances.`,
            frequently: `Air travel adds substantially to your footprint. Try to consolidate trips and choose direct flights when possible.`,
            rarely: `Good job limiting air travel! Consider carbon offsetting for the flights you do take.`,
            never: `Not flying is one of the most impactful choices you can make. Excellent!`,
          },
        },
        waste: {
          tips: {
            'extra large': `Large waste bags indicate high consumption. Try composting food waste, buying in bulk to reduce packaging, and choosing reusable products.`,
            large: `Consider reducing waste by composting, buying secondhand, and choosing products with minimal packaging.`,
            medium: `You're generating a moderate amount of waste. Small changes like a reusable water bottle and shopping bags can help.`,
            small: `Great job minimizing waste! Continue focusing on reducing, reusing, and recycling.`,
          },
        },
        efficiency: {
          tips: {
            No: `Improving energy efficiency is one of the easiest wins. Switch to LED bulbs, insulate your home, and use smart thermostats.`,
            Sometimes: `You've started! Go further by upgrading appliances to Energy Star rated, sealing drafts, and using programmable timers.`,
            Yes: `Excellent energy efficiency habits! Consider a home energy audit to identify any remaining improvements.`,
          },
        },
      };

      ranked.forEach((cat) => {
        const template = tipTemplates[cat.key];
        if (!template) return;
        const tips = template.tips;
        const userVal = cat.userChoice;
        const tip = tips[userVal] || tips[Object.keys(tips)[0]];
        const saving = Math.round(cat.potential);

        insights.push({
          category: cat.key,
          label: cat.label,
          icon: cat.icon,
          tip,
          saving,
          userChoice: userVal,
          bestChoice: cat.bestChoice ? cat.bestChoice[0] : 'N/A',
          bestEmission: cat.bestChoice ? cat.bestChoice[1] : 0,
        });
      });

      return insights;
    },
  };

  // ── Chart Renderer ─────────────────────────────────────
  const Charts = {
    instances: {},

    destroy(id) {
      if (this.instances[id]) {
        this.instances[id].destroy();
        delete this.instances[id];
      }
    },

    /** Donut chart: emission breakdown */
    renderBreakdown(canvasId, categories) {
      this.destroy(canvasId);
      const labels = Object.values(categories).map(c => c.label);
      const values = Object.values(categories).map(c => c.value);
      const colors = ['#34d399', '#38bdf8', '#fbbf24', '#fb7185', '#a78bfa', '#a3e635'];

      const ctx = document.getElementById(canvasId).getContext('2d');
      this.instances[canvasId] = new Chart(ctx, {
        type: 'doughnut',
        data: {
          labels,
          datasets: [{
            data: values,
            backgroundColor: colors.map(c => c + '33'),
            borderColor: colors,
            borderWidth: 2,
            hoverBorderWidth: 3,
          }],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          cutout: '68%',
          plugins: {
            legend: {
              position: 'bottom',
              labels: {
                color: 'rgba(240,253,244,0.7)',
                font: { family: 'Inter', size: 12 },
                padding: 16,
                usePointStyle: true,
                pointStyleWidth: 10,
              },
            },
            tooltip: {
              backgroundColor: 'rgba(10,26,16,0.95)',
              borderColor: 'rgba(52,211,153,0.2)',
              borderWidth: 1,
              titleColor: '#f0fdf4',
              bodyColor: 'rgba(240,253,244,0.7)',
              titleFont: { family: 'Inter', weight: '600' },
              bodyFont: { family: 'Inter' },
              padding: 14,
              cornerRadius: 10,
              callbacks: {
                label: (ctx) => ` ${ctx.label}: ${ctx.parsed} kg CO₂`,
              },
            },
          },
        },
      });
    },

    /** Bar chart: user vs average vs best */
    renderComparison(canvasId, userEmission, avgEmission, bestEmission) {
      this.destroy(canvasId);
      const ctx = document.getElementById(canvasId).getContext('2d');
      this.instances[canvasId] = new Chart(ctx, {
        type: 'bar',
        data: {
          labels: ['Your Emission', 'Population Avg', 'Best in Dataset'],
          datasets: [{
            data: [userEmission, avgEmission, bestEmission],
            backgroundColor: [
              userEmission > avgEmission ? 'rgba(251,113,133,0.35)' : 'rgba(52,211,153,0.35)',
              'rgba(251,191,36,0.35)',
              'rgba(52,211,153,0.35)',
            ],
            borderColor: [
              userEmission > avgEmission ? '#fb7185' : '#34d399',
              '#fbbf24',
              '#34d399',
            ],
            borderWidth: 2,
            borderRadius: 8,
            barPercentage: 0.6,
          }],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          indexAxis: 'y',
          plugins: {
            legend: { display: false },
            tooltip: {
              backgroundColor: 'rgba(10,26,16,0.95)',
              borderColor: 'rgba(52,211,153,0.2)',
              borderWidth: 1,
              titleColor: '#f0fdf4',
              bodyColor: 'rgba(240,253,244,0.7)',
              padding: 14,
              cornerRadius: 10,
              callbacks: {
                label: (ctx) => ` ${ctx.parsed.x.toLocaleString()} kg CO₂/year`,
              },
            },
          },
          scales: {
            x: {
              grid: { color: 'rgba(52,211,153,0.06)' },
              ticks: { color: 'rgba(240,253,244,0.5)', font: { family: 'Inter', size: 11 } },
            },
            y: {
              grid: { display: false },
              ticks: { color: 'rgba(240,253,244,0.7)', font: { family: 'Inter', size: 12, weight: '500' } },
            },
          },
        },
      });
    },

    /** Radar chart: lifestyle profile */
    renderRadar(canvasId, categories) {
      this.destroy(canvasId);
      const labels = Object.values(categories).map(c => c.label);
      // Normalize values 0-100 based on min/max
      const userValues = Object.values(categories).map(c => {
        const range = c.max - c.min || 1;
        return Math.round(((c.value - c.min) / range) * 100);
      });
      const bestValues = Object.values(categories).map(() => 0);

      const ctx = document.getElementById(canvasId).getContext('2d');
      this.instances[canvasId] = new Chart(ctx, {
        type: 'radar',
        data: {
          labels,
          datasets: [
            {
              label: 'Your Profile',
              data: userValues,
              backgroundColor: 'rgba(52,211,153,0.15)',
              borderColor: '#34d399',
              borderWidth: 2,
              pointBackgroundColor: '#34d399',
              pointBorderColor: '#34d399',
              pointRadius: 4,
            },
            {
              label: 'Ideal Profile',
              data: bestValues,
              backgroundColor: 'rgba(163,230,53,0.08)',
              borderColor: '#a3e635',
              borderWidth: 1.5,
              borderDash: [5, 5],
              pointBackgroundColor: '#a3e635',
              pointRadius: 3,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              position: 'bottom',
              labels: {
                color: 'rgba(240,253,244,0.7)',
                font: { family: 'Inter', size: 12 },
                padding: 16,
                usePointStyle: true,
              },
            },
          },
          scales: {
            r: {
              angleLines: { color: 'rgba(52,211,153,0.08)' },
              grid: { color: 'rgba(52,211,153,0.08)' },
              pointLabels: {
                color: 'rgba(240,253,244,0.6)',
                font: { family: 'Inter', size: 11 },
              },
              ticks: { display: false },
              suggestedMin: 0,
              suggestedMax: 100,
            },
          },
        },
      });
    },

    /** Bar chart: emission by diet (global stats) */
    renderGlobalDiet(canvasId) {
      this.destroy(canvasId);
      const dietAvg = DataEngine.averageBy('Diet');
      const sorted = Object.entries(dietAvg).sort((a, b) => a[1] - b[1]);
      const colors = { vegan: '#34d399', vegetarian: '#a3e635', pescatarian: '#fbbf24', omnivore: '#fb7185' };

      const ctx = document.getElementById(canvasId).getContext('2d');
      this.instances[canvasId] = new Chart(ctx, {
        type: 'bar',
        data: {
          labels: sorted.map(([k]) => k.charAt(0).toUpperCase() + k.slice(1)),
          datasets: [{
            data: sorted.map(([, v]) => v),
            backgroundColor: sorted.map(([k]) => (colors[k] || '#34d399') + '44'),
            borderColor: sorted.map(([k]) => colors[k] || '#34d399'),
            borderWidth: 2,
            borderRadius: 8,
            barPercentage: 0.55,
          }],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: {
              backgroundColor: 'rgba(10,26,16,0.95)',
              borderColor: 'rgba(52,211,153,0.2)',
              borderWidth: 1,
              padding: 14,
              cornerRadius: 10,
              callbacks: {
                label: (ctx) => ` ${ctx.parsed.y.toLocaleString()} kg CO₂/year`,
              },
            },
          },
          scales: {
            x: {
              grid: { display: false },
              ticks: { color: 'rgba(240,253,244,0.7)', font: { family: 'Inter', size: 12, weight: '500' } },
            },
            y: {
              grid: { color: 'rgba(52,211,153,0.06)' },
              ticks: {
                color: 'rgba(240,253,244,0.5)',
                font: { family: 'Inter', size: 11 },
                callback: v => v.toLocaleString(),
              },
            },
          },
        },
      });
    },

    /** Bar chart: emission by transport (global stats) */
    renderGlobalTransport(canvasId) {
      this.destroy(canvasId);
      const tAvg = DataEngine.averageBy('Transport');
      const sorted = Object.entries(tAvg).sort((a, b) => a[1] - b[1]);
      const colors = { 'walk/bicycle': '#34d399', public: '#38bdf8', private: '#fb7185' };

      const ctx = document.getElementById(canvasId).getContext('2d');
      this.instances[canvasId] = new Chart(ctx, {
        type: 'bar',
        data: {
          labels: sorted.map(([k]) => k.charAt(0).toUpperCase() + k.slice(1)),
          datasets: [{
            data: sorted.map(([, v]) => v),
            backgroundColor: sorted.map(([k]) => (colors[k] || '#a78bfa') + '44'),
            borderColor: sorted.map(([k]) => colors[k] || '#a78bfa'),
            borderWidth: 2,
            borderRadius: 8,
            barPercentage: 0.55,
          }],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: {
              backgroundColor: 'rgba(10,26,16,0.95)',
              borderColor: 'rgba(52,211,153,0.2)',
              borderWidth: 1,
              padding: 14,
              cornerRadius: 10,
              callbacks: {
                label: (ctx) => ` ${ctx.parsed.y.toLocaleString()} kg CO₂/year`,
              },
            },
          },
          scales: {
            x: {
              grid: { display: false },
              ticks: { color: 'rgba(240,253,244,0.7)', font: { family: 'Inter', size: 12, weight: '500' } },
            },
            y: {
              grid: { color: 'rgba(52,211,153,0.06)' },
              ticks: {
                color: 'rgba(240,253,244,0.5)',
                font: { family: 'Inter', size: 11 },
                callback: v => v.toLocaleString(),
              },
            },
          },
        },
      });
    },
  };

  // ── Particle Background ────────────────────────────────
  function initParticles() {
    const canvas = document.getElementById('bg-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let particles = [];
    const COUNT = 60;

    function resize() {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    }

    function createParticles() {
      particles = [];
      for (let i = 0; i < COUNT; i++) {
        particles.push({
          x: Math.random() * canvas.width,
          y: Math.random() * canvas.height,
          vx: (Math.random() - 0.5) * 0.3,
          vy: (Math.random() - 0.5) * 0.3,
          r: Math.random() * 2 + 0.5,
          alpha: Math.random() * 0.3 + 0.05,
        });
      }
    }

    function draw() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      particles.forEach((p) => {
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < 0) p.x = canvas.width;
        if (p.x > canvas.width) p.x = 0;
        if (p.y < 0) p.y = canvas.height;
        if (p.y > canvas.height) p.y = 0;

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(52, 211, 153, ${p.alpha})`;
        ctx.fill();
      });

      // Connect nearby particles
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const dx = particles[i].x - particles[j].x;
          const dy = particles[i].y - particles[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 150) {
            ctx.beginPath();
            ctx.moveTo(particles[i].x, particles[i].y);
            ctx.lineTo(particles[j].x, particles[j].y);
            ctx.strokeStyle = `rgba(52, 211, 153, ${0.06 * (1 - dist / 150)})`;
            ctx.lineWidth = 0.5;
            ctx.stroke();
          }
        }
      }

      requestAnimationFrame(draw);
    }

    resize();
    createParticles();
    draw();
    window.addEventListener('resize', () => { resize(); createParticles(); });
  }

  // ── CountUp Animation ──────────────────────────────────
  function animateCount(el, target, duration = 1500, suffix = '') {
    const start = 0;
    const startTime = performance.now();

    function update(now) {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      // Ease-out-expo
      const ease = progress === 1 ? 1 : 1 - Math.pow(2, -10 * progress);
      const current = Math.round(start + (target - start) * ease);
      el.textContent = current.toLocaleString() + suffix;
      if (progress < 1) requestAnimationFrame(update);
    }

    requestAnimationFrame(update);
  }

  // ── Form Navigation ────────────────────────────────────
  function goToStep(step) {
    if (step < 0 || step >= state.totalSteps) return;
    state.currentStep = step;

    // Update form steps
    $$('.form-step').forEach((el, i) => {
      el.classList.toggle('active', i === step);
    });

    // Update progress bar
    $$('.progress-step').forEach((el, i) => {
      el.classList.remove('active', 'completed');
      if (i < step) el.classList.add('completed');
      if (i === step) el.classList.add('active');
    });

    $$('.progress-label').forEach((el, i) => {
      el.classList.toggle('active', i === step);
    });

    // Update progress fill line
    const fill = $('.progress-line-fill');
    if (fill) {
      const pct = step / (state.totalSteps - 1) * 100;
      fill.style.width = pct + '%';
    }

    // Scroll to calculator
    $('#calculator').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function nextStep() {
    collectCurrentStepAnswers();
    if (state.currentStep === state.totalSteps - 1) {
      calculateResults();
    } else {
      goToStep(state.currentStep + 1);
    }
  }

  function prevStep() {
    goToStep(state.currentStep - 1);
  }

  // ── Collect Answers ────────────────────────────────────
  function collectCurrentStepAnswers() {
    const step = $$('.form-step')[state.currentStep];
    if (!step) return;

    // Radio-style option cards
    step.querySelectorAll('.option-card.selected input[type="radio"]').forEach(input => {
      state.answers[input.name] = input.value;
    });

    // Sliders
    step.querySelectorAll('input[type="range"]').forEach(input => {
      state.answers[input.name] = parseFloat(input.value);
    });

    // Checkbox chips
    const checkboxGroups = {};
    step.querySelectorAll('.checkbox-chip.selected input[type="checkbox"]').forEach(input => {
      if (!checkboxGroups[input.name]) checkboxGroups[input.name] = [];
      checkboxGroups[input.name].push(input.value);
    });
    Object.assign(state.answers, checkboxGroups);
  }

  // ── Calculate & Render Results ─────────────────────────
  function calculateResults() {
    collectCurrentStepAnswers();

    // Show loading briefly
    const loading = $('.loading-overlay');
    if (loading) {
      loading.classList.remove('hidden');
      setTimeout(() => {
        loading.classList.add('hidden');
        renderResults();
      }, 1200);
    } else {
      renderResults();
    }
  }

  function renderResults() {
    const a = state.answers;
    const estimation = DataEngine.estimateEmission(a);
    const emission = estimation.emission;
    const gStats = DataEngine.globalStats();
    const percentile = DataEngine.percentile(emission);
    const categories = DataEngine.categoryBreakdown(a);
    const insights = DataEngine.generateInsights(a, emission);

    state.results = { emission, percentile, categories, insights, gStats };

    // Hide calculator, show results
    $('#calculator').style.display = 'none';

    // ── Score Card ──
    const resultsSection = $('#results');
    resultsSection.classList.add('visible');

    const scoreValue = $('#score-value');
    animateCount(scoreValue, emission, 2000);

    // Rating
    const ratingEl = $('#score-rating');
    ratingEl.className = 'score-rating';
    if (emission < gStats.avg * 0.75) {
      ratingEl.classList.add('low');
      ratingEl.innerHTML = '🌿 Below Average — Great job!';
    } else if (emission < gStats.avg * 1.25) {
      ratingEl.classList.add('medium');
      ratingEl.innerHTML = '🔶 Around Average — Room to improve';
    } else {
      ratingEl.classList.add('high');
      ratingEl.innerHTML = '<i data-lucide="circle-alert"></i> Above Average — Action needed';
    }

    // Percentile bar
    setTimeout(() => {
      const pFill = $('.percentile-fill');
      const pMarker = $('.percentile-marker');
      if (pFill) pFill.style.width = '100%';
      if (pMarker) pMarker.style.left = percentile + '%';
    }, 300);

    $('#percentile-text').textContent = `You emit more than ${percentile}% of people in our dataset`;

    // ── UIverse Data Cards ──
    renderDataCards(categories, emission, gStats);

    // ── Charts ──
    setTimeout(() => {
      Charts.renderBreakdown('chart-breakdown', categories);
      Charts.renderComparison('chart-comparison', emission, Math.round(gStats.avg), gStats.min);
      Charts.renderRadar('chart-radar', categories);

      // Potential savings line-style as bar
      Charts.renderSavingsChart('chart-savings', categories);
    }, 500);

    // ── Insights ──
    const insightsSection = $('#insights');
    insightsSection.classList.add('visible');
    const insightsGrid = $('#insights-grid');
    insightsGrid.innerHTML = '';

    insights.filter(ins => ins.saving > 0).slice(0, 6).forEach(ins => {
      const card = document.createElement('div');
      card.className = `premium-card insight-card`;
      card.innerHTML = `

          <div class="insight-header">
            <div class="insight-icon">${ins.icon}</div>
            <h3 class="insight-title">${ins.label}</h3>
          </div>
          <p class="insight-text">${ins.tip}</p>
          <div class="insight-saving">
            <span>↓</span> Potential saving: ~${ins.saving.toLocaleString()} kg CO₂/year
          </div>
        
      `;
      insightsGrid.appendChild(card);
    });

    // ── Global Stats ──
    const globalSection = $('#global-stats');
    globalSection.classList.add('visible');

    animateCount($('#stat-avg'), Math.round(gStats.avg), 1500, ' kg');
    animateCount($('#stat-min'), gStats.min, 1500, ' kg');
    animateCount($('#stat-max'), gStats.max, 1500, ' kg');
    animateCount($('#stat-count'), gStats.count, 1500);

    setTimeout(() => {
      Charts.renderGlobalDiet('chart-global-diet');
      Charts.renderGlobalTransport('chart-global-transport');
    }, 800);

    // Scroll to results
    resultsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // ── UIverse-style Data Cards Renderer ──────────────────
  function renderDataCards(categories, emission, gStats) {
    const grid = $('#data-cards-grid');
    if (!grid) return;
    grid.innerHTML = '';

    const colorMap = {
      diet:       'accent-emerald',
      transport:  'accent-sky',
      energy:     'accent-amber',
      travel:     'accent-rose',
      waste:      'accent-violet',
      efficiency: 'accent-lime',
    };

    const svgIcons = {
      diet: '🥗',
      transport: '🚗',
      energy: '⚡',
      travel: '✈️',
      waste: '♻️',
      efficiency: '💡',
    };

    const columnMap = {
      diet: 'Diet',
      transport: 'Transport',
      energy: 'Heating Energy Source',
      travel: 'Frequency of Traveling by Air',
      waste: 'Waste Bag Size',
      efficiency: 'Energy efficiency',
    };

    Object.entries(categories).forEach(([key, cat]) => {
      const dc = colorMap[key] || 'dc-emerald';
      const avg = Math.round(gStats.avg);
      const delta = avg > 0 ? ((cat.value - avg) / avg * 100).toFixed(1) : 0;
      const deltaClass = delta <= 0 ? 'positive' : 'negative';
      const deltaSign = delta <= 0 ? '' : '+';
      const saving = Math.round(cat.value - cat.min);

      // Badge: green if below avg, amber if near, rose if above
      let badgeClass = 'badge-green';
      let badgeText = 'Low';
      if (cat.value > avg * 1.15) {
        badgeClass = 'badge-rose';
        badgeText = 'High';
      } else if (cat.value > avg * 0.85) {
        badgeClass = 'badge-amber';
        badgeText = 'Avg';
      }

      // Generate mini bar chart data from dataset
      const colName = columnMap[key];
      const groupAvg = DataEngine.averageBy(colName);
      const groupValues = Object.values(groupAvg);
      const maxGroupVal = Math.max(...groupValues, 1);
      // Pad or trim to 7 bars
      const barHeights = [];
      const sortedEntries = Object.entries(groupAvg).sort((a, b) => a[1] - b[1]);
      for (let i = 0; i < 7; i++) {
        if (i < sortedEntries.length) {
          barHeights.push(Math.round((sortedEntries[i][1] / maxGroupVal) * 100));
        } else {
          barHeights.push(Math.round(Math.random() * 40 + 20));
        }
      }

      const barsHTML = barHeights.map(h => {
        const fillH = Math.max(h - 10, 10);
        return `<div class="dc-bar-wrapper" style="height:${h}%">
          <div class="dc-bar" style="height:${fillH}%"></div>
        </div>`;
      }).join('');

      const card = document.createElement('div');
      card.className = `luminous-card ${dc}`;
      card.innerHTML = `
        <div class="luminous-light-layer">
          <div class="luminous-slit"></div>
          <div class="luminous-lumen"><div class="min"></div><div class="mid"></div><div class="hi"></div></div>
          <div class="luminous-darken"><div class="sl"></div><div class="ll"></div><div class="slt"></div><div class="srt"></div></div>
        </div>
        <div class="luminous-content data-card">

          <div class="data-card-header">
            <div class="data-card-title-group">
              <div class="data-card-icon">
                ${svgIcons[key] || cat.icon}
              </div>
              <h3 class="data-card-name">${cat.label}</h3>
            </div>
            <span class="data-card-badge ${badgeClass}">
              <span class="badge-dot"></span>
              ${badgeText}
            </span>
          </div>

          <div class="data-card-stats">
            <div class="dc-stat-box">
              <p class="dc-stat-label">Your Impact</p>
              <p class="dc-stat-value">${cat.value.toLocaleString()}</p>
              <span class="dc-stat-change ${deltaClass}">${deltaSign}${delta}%</span>
            </div>
            <div class="dc-stat-box">
              <p class="dc-stat-label">Dataset Avg</p>
              <p class="dc-stat-value">${avg.toLocaleString()}</p>
              <span class="dc-stat-change positive">baseline</span>
            </div>
          </div>

          <div class="dc-mini-chart">
            <div class="dc-bars">
              ${barsHTML}
            </div>
          </div>

          <div class="data-card-footer">
            <span class="dc-footer-label">
              Save ~${saving.toLocaleString()} kg
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M19 9l-7 7-7-7"/></svg>
            </span>
            <button class="dc-detail-btn" onclick="document.getElementById('insights').scrollIntoView({behavior:'smooth'})">
              View Tips
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M9 5l7 7-7 7"/></svg>
            </button>
            </button>
          </div>
        </div>
      `;
      grid.appendChild(card);
    });
  }

  // Savings chart — horizontal bar showing potential reduction per category
  Charts.renderSavingsChart = function (canvasId, categories) {
    this.destroy(canvasId);
    const entries = Object.values(categories)
      .map(c => ({ label: c.label, saving: Math.round(c.value - c.min) }))
      .filter(c => c.saving > 0)
      .sort((a, b) => b.saving - a.saving);

    const ctx = document.getElementById(canvasId).getContext('2d');
    const colors = ['#34d399', '#38bdf8', '#fbbf24', '#fb7185', '#a78bfa', '#a3e635'];

    this.instances[canvasId] = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: entries.map(e => e.label),
        datasets: [{
          label: 'Potential Savings (kg CO₂)',
          data: entries.map(e => e.saving),
          backgroundColor: entries.map((_, i) => (colors[i % colors.length]) + '44'),
          borderColor: entries.map((_, i) => colors[i % colors.length]),
          borderWidth: 2,
          borderRadius: 8,
          barPercentage: 0.55,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        indexAxis: 'y',
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: 'rgba(10,26,16,0.95)',
            borderColor: 'rgba(52,211,153,0.2)',
            borderWidth: 1,
            padding: 14,
            cornerRadius: 10,
            callbacks: {
              label: (ctx) => ` Save ~${ctx.parsed.x.toLocaleString()} kg CO₂/year`,
            },
          },
        },
        scales: {
          x: {
            grid: { color: 'rgba(52,211,153,0.06)' },
            ticks: { color: 'rgba(240,253,244,0.5)', font: { family: 'Inter', size: 11 } },
          },
          y: {
            grid: { display: false },
            ticks: { color: 'rgba(240,253,244,0.7)', font: { family: 'Inter', size: 12, weight: '500' } },
          },
        },
      },
    });
  };

  // ── Recalculate ────────────────────────────────────────
  function recalculate() {
    // Reset
    state.currentStep = 0;
    state.answers = {};
    state.results = null;

    // Reset option cards
    $$('.option-card').forEach(c => c.classList.remove('selected'));
    $$('.checkbox-chip').forEach(c => c.classList.remove('selected'));

    // Reset sliders
    $$('input[type="range"]').forEach(r => {
      r.value = r.defaultValue;
      const display = r.closest('.slider-group')?.querySelector('.slider-value');
      if (display) display.textContent = r.defaultValue + (r.dataset.suffix || '');
    });

    // Show calculator, hide results
    $('#calculator').style.display = 'block';
    $('#results').classList.remove('visible');
    $('#insights').classList.remove('visible');
    $('#global-stats').classList.remove('visible');

    goToStep(0);
    $('#calculator').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // ── Event Binding ──────────────────────────────────────
  function bindEvents() {
    // Option cards (radio)
    $$('.option-card').forEach(card => {
      card.addEventListener('click', () => {
        const input = card.querySelector('input[type="radio"]');
        if (input) {
          const group = card.closest('.option-grid');
          group.querySelectorAll('.option-card').forEach(c => c.classList.remove('selected'));
          card.classList.add('selected');
          input.checked = true;
        }
      });
    });

    // Checkbox chips
    $$('.checkbox-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        chip.classList.toggle('selected');
        const input = chip.querySelector('input[type="checkbox"]');
        if (input) input.checked = chip.classList.contains('selected');
      });
    });

    // Sliders
    $$('input[type="range"]').forEach(slider => {
      const display = slider.closest('.slider-group')?.querySelector('.slider-value');
      slider.addEventListener('input', () => {
        if (display) {
          display.textContent = parseFloat(slider.value).toLocaleString() + (slider.dataset.suffix || '');
        }
      });
    });

    // Nav buttons
    $$('.btn-next').forEach(btn => btn.addEventListener('click', nextStep));
    $$('.btn-prev').forEach(btn => btn.addEventListener('click', prevStep));

    // Progress step clicks
    $$('.progress-step').forEach((step, i) => {
      step.addEventListener('click', () => {
        if (i <= state.currentStep) goToStep(i);
      });
    });

    // Hero CTA
    const heroCta = $('#hero-cta');
    if (heroCta) {
      heroCta.addEventListener('click', () => {
        $('#calculator').scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    }

    // Recalculate
    const recalcBtn = $('#recalc-btn');
    if (recalcBtn) recalcBtn.addEventListener('click', recalculate);

    // Nav scroll effect
    window.addEventListener('scroll', () => {
      const nav = $('.nav-bar');
      if (nav) nav.classList.toggle('scrolled', window.scrollY > 50);
    });

    // Smooth nav links
    $$('.nav-links a').forEach(link => {
      link.addEventListener('click', (e) => {
        const href = link.getAttribute('href');
        if (href.startsWith('#')) {
          e.preventDefault();
          const target = document.querySelector(href);
          if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      });
    });
  }

  // ── Scroll Reveal ──────────────────────────────────────
  function initScrollReveal() {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
        }
      });
    }, { threshold: 0.1 });

    $$('.reveal').forEach(el => observer.observe(el));
  }

  // ── Animated Starfield ─────────────────────────────────
  function initStars() {
    function generateStars(count, color) {
      let value = `${Math.floor(Math.random() * 2000)}px ${Math.floor(Math.random() * 2000)}px ${color}`;
      for (let i = 1; i < count; i++) {
        value += `, ${Math.floor(Math.random() * 2000)}px ${Math.floor(Math.random() * 2000)}px ${color}`;
      }
      return value;
    }

    const s1 = $('#stars');
    const s2 = $('#stars2');
    const s3 = $('#stars3');

    if (s1) s1.style.boxShadow = generateStars(300, '#fff');
    if (s2) s2.style.boxShadow = generateStars(100, '#fff');
    if (s3) s3.style.boxShadow = generateStars(50, '#fff');
  }

  // ── Init ───────────────────────────────────────────────
  async function init() {
    initStars();

    // Load CSV
    await loadCSV();

    // Update hero stats
    if (state.csvData.length > 0) {
      const gStats = DataEngine.globalStats();
      const heroDataPoints = $('#hero-data-points');
      const heroAvg = $('#hero-avg');
      const heroDiets = $('#hero-diets');

      if (heroDataPoints) animateCount(heroDataPoints, gStats.count, 1800);
      if (heroAvg) animateCount(heroAvg, Math.round(gStats.avg), 1800);
      if (heroDiets) heroDiets.textContent = '4';
    }

    // Bind events
    bindEvents();
    initScrollReveal();

    // Hide loading
    const loading = $('.loading-overlay');
    if (loading) {
      setTimeout(() => loading.classList.add('hidden'), 600);
    }

    // Initialize first step
    goToStep(0);
  }

  // Start
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
