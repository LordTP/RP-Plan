import { redirect } from 'next/navigation';

export default function DesignComponentsPage() {
  redirect('/components?tab=in-progress');
}
