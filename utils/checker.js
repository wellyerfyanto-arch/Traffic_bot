const axios = require('axios');

class SecurityChecker {
    constructor() {
        this.checkUrls = {
            whoer: 'https://whoer.net/v2/geoip-city',
            ipinfo: 'https://ipinfo.io/json',
            ipleak: 'https://ipleak.net/json/'
        };
    }

    async checkWhoerLeaks(proxy = null) {
        try {
            const config = {
                timeout: 10000,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                    'Accept': 'application/json'
                }
            };

            if (proxy) {
                config.proxy = proxy;
            }

            const response = await axios.get(this.checkUrls.whoer, config);
            const data = response.data;

            // Analyze the results
            const leaks = [];

            // Check IP
            if (data.ip) {
                console.log(`Current IP: ${data.ip}`);
            }

            // Check DNS leaks
            if (data.dns && data.dns.length > 0) {
                console.log(`DNS Servers: ${data.dns.join(', ')}`);
            }

            // Check WebRTC (if available in data)
            if (data.webrtc === true) {
                leaks.push('WebRTC leak detected');
            }

            // Check location
            if (data.city && data.country) {
                console.log(`Location: ${data.city}, ${data.country}`);
                
                // Compare with expected location if proxy location is known
                if (proxy && proxy.location) {
                    if (data.country !== proxy.location.country) {
                        leaks.push('Location mismatch');
                    }
                }
            }

            // Check timezone
            if (data.timezone) {
                console.log(`Timezone: ${data.timezone}`);
            }

            // Check language
            if (data.lang) {
                console.log(`Language: ${data.lang}`);
            }

            // Return results
            return {
                success: true,
                ip: data.ip || 'Unknown',
                location: data.city && data.country ? `${data.city}, ${data.country}` : 'Unknown',
                timezone: data.timezone || 'Unknown',
                isAnonymous: data.isAnonymous || false,
                leaks: leaks.length > 0 ? leaks : [],
                isSecure: leaks.length === 0
            };

        } catch (error) {
            console.error('Error checking Whoer leaks:', error.message);
            return {
                success: false,
                error: error.message,
                isSecure: false
            };
        }
    }

    async checkMultipleSources(proxy = null) {
        const results = {
            whoer: null,
            ipinfo: null,
            ipleak: null
        };

        try {
            // Check Whoer
            results.whoer = await this.checkWhoerLeaks(proxy);

            // Check IPInfo
            results.ipinfo = await this.checkIPInfo(proxy);

            // Check IPLeak
            results.ipleak = await this.checkIPLeak(proxy);

            // Overall assessment
            const allLeaks = [
                ...(results.whoer.leaks || []),
                ...(results.ipinfo.leaks || []),
                ...(results.ipleak.leaks || [])
            ];

            return {
                overall: {
                    isSecure: allLeaks.length === 0,
                    totalLeaks: allLeaks.length,
                    leaks: allLeaks,
                    sources: Object.keys(results).filter(key => results[key]?.success)
                },
                details: results
            };

        } catch (error) {
            console.error('Error in multi-source check:', error);
            return {
                overall: {
                    isSecure: false,
                    totalLeaks: 1,
                    leaks: ['Check failed'],
                    sources: []
                },
                details: results,
                error: error.message
            };
        }
    }

    async checkIPInfo(proxy) {
        try {
            const config = {
                timeout: 10000,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                }
            };

            if (proxy) {
                config.proxy = proxy;
            }

            const response = await axios.get(this.checkUrls.ipinfo, config);
            const data = response.data;

            const leaks = [];
            
            if (data.ip) console.log(`IPInfo IP: ${data.ip}`);
            if (data.city && data.country) console.log(`IPInfo Location: ${data.city}, ${data.country}`);
            if (data.org) console.log(`IPInfo ISP: ${data.org}`);

            return {
                success: true,
                data: data,
                leaks: leaks
            };

        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    async checkIPLeak(proxy) {
        try {
            const config = {
                timeout: 10000,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                }
            };

            if (proxy) {
                config.proxy = proxy;
            }

            const response = await axios.get(this.checkUrls.ipleak, config);
            const data = response.data;

            const leaks = [];

            // Check for DNS leaks
            if (data.dns && data.dns.length > 1) {
                const dnsIps = data.dns.map(d => d.ip || d);
                console.log(`IPLeak DNS: ${dnsIps.join(', ')}`);
                
                // If DNS IPs don't match the proxy IP, potential leak
                if (data.ip && dnsIps.some(dnsIp => dnsIp !== data.ip)) {
                    leaks.push('DNS leak detected');
                }
            }

            return {
                success: true,
                data: data,
                leaks: leaks
            };

        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    getRecommendations(securityResults) {
        const recommendations = [];

        if (!securityResults.overall.isSecure) {
            recommendations.push('Enable DNS leak protection in VPN/proxy settings');
            recommendations.push('Disable WebRTC in browser');
            recommendations.push('Use a more reliable proxy service');
            recommendations.push('Consider using VPN instead of proxy for better anonymity');
        }

        if (securityResults.details.whoer && !securityResults.details.whoer.isAnonymous) {
            recommendations.push('Your connection is not fully anonymous');
        }

        if (securityResults.overall.totalLeaks > 0) {
            recommendations.push(`Fix ${securityResults.overall.totalLeaks} detected leak(s)`);
        }

        return recommendations.length > 0 ? recommendations : ['Your connection appears secure. No action needed.'];
    }
}

module.exports = SecurityChecker;
