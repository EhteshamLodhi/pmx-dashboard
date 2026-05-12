import SignIn from './pages/SignIn';

function getInitialError(authError?: string, authDetail?: string) {
  if (authError === 'supabase_not_configured') {
    return 'Supabase is not configured for this environment.';
  }

  if (authError === 'microsoft_sign_in_failed') {
    if (authDetail) {
      return `Microsoft sign-in could not be started: ${authDetail}`;
    }

    return 'Microsoft sign-in could not be started. Check your Supabase Azure provider settings.';
  }

  if (authError === 'microsoft_callback_failed') {
    return 'Microsoft sign-in could not be completed. Check the Azure tenant URL and callback configuration.';
  }

  return null;
}

export default async function HomePage({
  searchParams,
}: {
  searchParams?: Promise<{ authError?: string; authDetail?: string }>;
}) {
  const resolvedSearchParams = await searchParams;
  return <SignIn initialError={getInitialError(resolvedSearchParams?.authError, resolvedSearchParams?.authDetail)} />;
}
