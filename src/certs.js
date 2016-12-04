import https from 'https';
import makeCertList from '@gasbuddy/composert';

export async function trustCertificates(...CAs) {
  const certList = await makeCertList(...CAs);
  https.globalAgent.options.ca = certList;
  return certList;
}
