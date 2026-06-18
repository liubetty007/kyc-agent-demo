import { redirect } from 'next/navigation';

export default function ComplianceLegacyRedirectPage() {
  redirect('/cases/compliance-submitted');
}
