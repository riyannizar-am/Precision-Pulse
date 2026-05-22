const { machineIdSync } = require('node-machine-id');
const os = require('os');

class LicensingManager {
    constructor() {
        this.apiUrl = 'https://amaudiovisuals.com/api.php';
        this.licenseData = JSON.parse(localStorage.getItem('cuetimer_license')) || null;
        this.trialStartTime = localStorage.getItem('cuetimer_trial_start') || null;
        this.hwid = machineIdSync(true); // Generates unique motherboard/OS ID
        this.computerName = os.hostname();
        this.TRIAL_DURATION_MS = 10 * 60 * 1000; // 10 minutes trial
        this.GRACE_PERIOD_MS = 2 * 24 * 60 * 60 * 1000; // 48 hours grace period
        this.onLockStateChange = null;
    }

    async init() {
        // Initialize Trial if none exists
        if (!this.trialStartTime) {
            this.trialStartTime = Date.now().toString();
            localStorage.setItem('cuetimer_trial_start', this.trialStartTime);
        }

        // Silent background check if we have an active license and internet
        if (navigator.onLine && this.licenseData && this.licenseData.key && this.licenseData.key !== 'admin') {
            await this.verifyLicenseBackground();
        }

        this.checkState();
        
        // Check state every second (for trial countdown)
        setInterval(() => this.checkState(), 1000);
    }

    checkState() {
        const now = Date.now();
        const trialStarted = parseInt(this.trialStartTime);
        const timeElapsed = now - trialStarted;
        const trialRemaining = Math.max(0, this.TRIAL_DURATION_MS - timeElapsed);

        if (this.licenseData && this.licenseData.active) {
            // License exists: Check Expiration Date
            let expiryStr = this.licenseData.expiry_date;
            if (!expiryStr.includes('T') && !expiryStr.includes('Z')) {
                expiryStr = expiryStr.replace(/-/g, '/') + ' UTC'; // Fix cross-timezone instant expiry
            }
            const expiry = new Date(expiryStr).getTime();
            const daysRemaining = Math.ceil((expiry - now) / (1000 * 60 * 60 * 24));

            if (now > expiry + this.GRACE_PERIOD_MS) {
                // Hard Lock (Grace period expired)
                this._lock("License Expired. Please enter new activation key.", expiryStr);
            } else if (now > expiry) {
                // Grace Period Active
                const lockoutMs = (expiry + this.GRACE_PERIOD_MS) - now;
                this._unlock(0, true, expiryStr, daysRemaining, true, lockoutMs);
            } else {
                // Normal Active
                this._unlock(0, true, expiryStr, daysRemaining, false, null);
            }
        } else {
            // No License: Trial Mode
            if (trialRemaining <= 0) {
                this._lock("Trial Expired. Please enter your Activation Key.", null);
            } else {
                this._unlock(trialRemaining, false, null, null, false, null);
            }
        }
    }

    _lock(message, expiryStr) {
        if (this.onLockStateChange) this.onLockStateChange(true, message, 0, false, expiryStr, null, false, null);
    }

    _unlock(trialRemaining, isActivated, expiryStr, daysRemaining, isGracePeriod, lockoutMs) {
        if (this.onLockStateChange) this.onLockStateChange(false, "", trialRemaining, isActivated, expiryStr, daysRemaining, isGracePeriod, lockoutMs);
    }

    async activate(key, userMachineName) {
        // Developer / Testing Bypass Door
        if (key === 'admin') {
            this.licenseData = { key: 'admin', active: true, expiry_date: '2099-01-01 00:00:00' };
            localStorage.setItem('cuetimer_license', JSON.stringify(this.licenseData));
            this.checkState();
            return { success: true, message: "Developer bypass successful." };
        }

        try {
            // Use user-provided machine name instead of auto-detected hostname
            const machineName = userMachineName || this.computerName;
            // Ensure payload format matches what the PHP backend expects
            const formData = new FormData();
            formData.append('action', 'activate');
            formData.append('license_key', key);
            formData.append('hardware_id', this.hwid);
            formData.append('computer_name', machineName);

            const res = await fetch(this.apiUrl, { method: 'POST', body: formData });
            const data = await res.json();

            if (data.success) {
                this.licenseData = {
                    key: key,
                    active: true,
                    expiry_date: data.expiry_date
                };
                localStorage.setItem('cuetimer_license', JSON.stringify(this.licenseData));
                this.checkState();
            }
            return data;
        } catch (err) {
            return { success: false, message: "Network error. Ensure you have an active internet connection to activate." };
        }
    }

    async verifyLicenseBackground() {
        try {
            const formData = new FormData();
            formData.append('action', 'check');
            formData.append('license_key', this.licenseData.key);
            formData.append('hardware_id', this.hwid);

            const res = await fetch(this.apiUrl, { method: 'POST', body: formData });
            const data = await res.json();

            // If the server explicitly rejects the check (not active and not expired)
            if (data.success === false || (data.success === true && data.status !== 'active' && data.status !== 'expired')) {
                this.licenseData = null;
                localStorage.removeItem('cuetimer_license');
                this.checkState();
            } else if (data.success && (data.status === 'active' || data.status === 'expired')) {
                // Keep local expiry date updated quietly
                this.licenseData.expiry_date = data.expiry_date;
                localStorage.setItem('cuetimer_license', JSON.stringify(this.licenseData));
            }
        } catch (err) {
            // Fail safe: Server down or offline, rely strictly on local license Expiry check.
            console.warn("Silent licensing check failed. Trusting local offline license.");
        }
    }

    formatTimeRemaining(ms) {
        const s = Math.ceil(ms / 1000);
        return `${Math.floor(s/60).toString().padStart(2,'0')}:${(s%60).toString().padStart(2,'0')}`;
    }
}

module.exports = LicensingManager;
