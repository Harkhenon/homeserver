import Layout from '@js/Layouts/Layout';
import HostingForm from './HostingForm';

export default function EditHost({ host, auth }) {

  return (
    <Layout auth={auth}>
      <main>
        <HostingForm
          type="edit"
          host={host}
          title={`Edit ${host.domain}`}
        />
      </main>
    </Layout>
  )
}