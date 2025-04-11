import {
  Form,
  Divider,
  Icon,
  Button,
  Input,
  Segment,
  Header as Text
} from 'semantic-ui-react';

import CountriesDropdown from '@/Components/CountriesDropdown';
import SSLForm from '@pages/Hosting/SSLForm';
import { Head, useForm, router } from '@inertiajs/react';
import HSBreadcrumb from '../Parts/HSBreadcrumb';

export default function HostingForm({
  type = "create",
  title = "Create host",
  host = {}
 }) {

  if(!type) return;

  const form = useForm({
    ...host,
    ssl_form: 0
  });

  console.log(form.data)


  const handleSubmit = () => {
    console.log(form)
  }

  return (
    <>
      <Head title={title} />
      <HSBreadcrumb />
      <Text size="huge" className="!text-white">
        Edit Domain hosting
      </Text>
      <Segment as={Form} onSubmit={handleSubmit} inverted>
        <Form.Group widths={2} className='float-right'>
          <Form.Field>
            <Button
              type="submit"
              color="green"
              labelPosition='left'
              icon
            >
              <Icon name="check" />
              Save
            </Button>
          </Form.Field>
        </Form.Group>
        <Divider horizontal className='p-10 !text-white'>
          <Icon name="globe" color="orange" /> Domain
        </Divider>
        <Form.Group widths={2}>
          <Form.Field>
            <label>Domain Name</label>
            <Input
              type="text"
              name="domain"
              onChange={(e, {name, value}) => form.setData(name, value)}
              error={null}
              value={form.data.domain}
            />
          </Form.Field>
          <Form.Field>
            <label>Name Server 1</label>
            <Input
              type="text"
              name="ns1"
              onChange={(e, {name, value}) => form.setData(name, value)}
              error={null}
              value={form.data.ns1}
            />
          </Form.Field>
          <Form.Field>
            <label>Name Server 2</label>
            <Input
              type="text"
              name="ns2"
              onChange={(e, {name, value}) => form.setData(name, value)}
              error={null}
              value={form.data.ns2}
            />
          </Form.Field>
        </Form.Group>
        <Divider horizontal className='p-10 !text-white'>
          <Icon name="server" color="orange"/> Webserver
        </Divider>
        <Form.Group widths={2}>
          <Form.Field>
            <label>Root Directory</label>
            <Input
              type="text"
              name="root_dir"
              onChange={(e, {name, value}) => form.setData(name, value)}
              disabled
              value={`/var/www/${form.data.domain}/public_html`}
            />
          </Form.Field>
          <Form.Field>
            <label>SSL Directory</label>
            <Input
              type="text"
              name="root_dir"
              onChange={(e, {name, value}) => form.setData(name, value)}
              disabled
              value={`/var/www/${form.data.domain}/ssl`}
            />
          </Form.Field>
          <Form.Field>
            <label>NodeJS Port</label>
            <Input
              type="number"
              min={4000}
              max={5000}
              onChange={(e, {name, value}) => form.setData(name, value)}
              name="node_port"
              value={form.data.node_port}
            />
          </Form.Field>
        </Form.Group>
        <Form.Group widths={2}>
          <Form.Field>
            <label>PHP User (PHP-FPM)</label>
            <Input
              type="text"
              name="php_user"
              onChange={(e, {name, value}) => form.setData(name, value)}
              value={form.data.php_user}
            />
          </Form.Field>
          <Form.Field>
            <label>Disk space (0 for unlimited)</label>
            <Input
              type="number"
              name="disk_space"
              onChange={(e, {name, value}) => form.setData(name, value)}
              value={form.data.disk_space}
              label={{ tag: true, content: "MB" }}
              labelPosition='right'
            />
          </Form.Field>
        </Form.Group>
        <Form.Group widths={2}>
          <Form.Field>
            <label>FTP access</label>
            <Form.Checkbox
              toggle
              name='ftp_enabled'
              value={form.data.ftp_enabled}
              onChange={(e, {name, checked}) => form.setData(name, checked?1:0)}
            />
          </Form.Field>
          <Form.Field>
            <label>SSH enabled</label>
            <Form.Checkbox
              toggle
              name='ssh_enabled'
              value={form.data.ssh_enabled}
              onChange={(e, {name, checked}) => form.setData(name, checked?1:0)}
            />
          </Form.Field>
        </Form.Group>
        <Divider horizontal className='p-10 !text-white'>
            <Icon name="server" color="orange"/> SSL Section
        </Divider>
        <SSLForm form={form}  />
      </Segment>
    </>
  )
}
