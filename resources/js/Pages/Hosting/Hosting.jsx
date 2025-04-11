import { useState, Suspense, useEffect } from 'react';
import {
  Button,
  Icon,
  Header as Text,
  Segment,
  Table,
  Loader,
  List
} from 'semantic-ui-react';

import HSBreadcrumb from '@pages/Parts/HSBreadcrumb';
import Layout from '@js/Layouts/Layout';
import { say } from '@js/Resources/i18n/I18N';
import '@sass/Hosting.scss';
import { Link, useForm } from '@inertiajs/react';

const Hosting = ({ hosts, auth }) => {

  const { delete: destroy } = useForm();

  const deleteHost = (e, { "data-id": id }) => {
    if(confirm(`Êtes-vous sûr de vouloir supprimer ${hosts.find(e => e.id === id).domain} ?`))
    destroy(route('hosting.destroy', {
      hosts: id
    }));
  }

  return (
    <Layout auth={auth} title="Hosts">
      <main>
        <HSBreadcrumb />
        {hosts && (
          <div className=''>
            <Text as={Segment} icon inverted className="host-header">
              <Icon name="server" />
              {say('hs.host.manage', 'fr')}
              <Text.Subheader>
                See all your hosts and their details
              </Text.Subheader>
            </Text>
            <Button
              className='!m-10'
              icon
              color='green'
              circular
              onClick={() => setIsCreating(true)}
            >
              <Icon name='add'/> {say('hs.host.create', 'fr')}
            </Button>
            <Table celled padded>
              <Table.Header>
                <Table.HeaderCell content="Domain" icon="world" colSpan='1' />
                <Table.HeaderCell content="DNS Servers" icon="server" colSpan='1'/>
                <Table.HeaderCell content="SSL" icon="lock" colSpan='3' />
              </Table.Header>
              <Table.Body>
              <Suspense fallback={<p>{say('hs.loading', 'fr')}</p>}>
                { !hosts ? <Loader /> :
                hosts.map(element => (
                  <Table.Row key={element.domain}>
                    <Table.Cell>
                      <Text size="large">
                        <Link href={`/hosting/edit/${element.id}`}>
                          {element.domain}
                        </Link>
                      </Text>
                    </Table.Cell>
                    <Table.Cell>
                      <List>
                        <List.Item>
                          <Icon name="arrow right"/>{element.ns1}
                        </List.Item>
                        <List.Item>
                          <Icon name="arrow right"/>{element.ns2}
                        </List.Item>
                      </List>
                    </Table.Cell>
                    <Table.Cell positive>
                      <Icon name="check" color="green" />
                    </Table.Cell>
                    {element.default !== 1 && (
                      <Table.Cell collapsing>
                        <Button
                          color="red"
                          onClick={deleteHost}
                          data-id={element.id}
                          content="Delete"
                        />
                      </Table.Cell>
                      ) || (
                          <>
                            <p>Default domain</p>
                            <p>Can't edit or delete it</p>
                          </>
                      )}
                  </Table.Row>
              ))
            }
            
              </Suspense>  
              </Table.Body>
            </Table>
          </div>
        ) || <Loader active />}

      </main>
    </Layout>
  )
}

export default Hosting