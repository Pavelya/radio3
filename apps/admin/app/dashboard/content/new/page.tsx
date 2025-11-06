import UniverseDocForm from '@/components/universe-doc-form';

export default function NewDocumentPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Create Universe Document</h1>
      <div className="bg-white shadow rounded-lg p-6">
        <UniverseDocForm mode="create" />
      </div>
    </div>
  );
}
