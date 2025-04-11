import { useState } from "react";
import { 
  Dropdown, 
  Header as Text, 
  TextArea,
  Form,
  Input,
  Checkbox,
  Icon
} from "semantic-ui-react";

import CountriesDropdown from "@/Components/CountriesDropdown";

export default function SSLForm({form}) {

  const [ value, setValue ] = useState(1);

  const SslChoiceDropdown = () => (
    <>
      <Dropdown
        placeholder="Choose an option"
        onChange={(e, {name, value}) => {
          value === 3 
          ? form.setData({
            ...form.data,
            'ssl_letsencrypt': 1,
            'ssl_form': value
          })
          : form.setData({
            ...form.data,
            'ssl_letsencrypt': 0,
            'ssl_form': value
          });
        }}
        name="ssl_form"
        options={[
          {
            key: "none",
            value: 0,
            text: "No SSL certificate",
            description: "Don't secure your website (http)"
          },
          {
            key: "self",
            value: 1,
            text: "Make Self Signed Certificate",
            description: "Not Really Secure"
          },
          {
            key: "purchased",
            value: 2,
            text: "Import your own certificate" ,
            description: "Purchased from professionals",
          },
          {
            key: "letsencrypt",
            value: 3,
            text: "Create Let's Encrypt certificate" ,
            description: "Free level 1 certificate",
          }
        ]}
        value={form.data.ssl_form !== undefined ? form.data.ssl_form : form.setData('ssl_form', 0)}
      />
    </>
  );

  const sslChoices = {
    0: () => (
      <Text className="!text-white">
        <Icon name="delete" /> No certificate
      </Text>
    ),
    1: () => (
      <Form.Group>
        <Form.Field>
          <label>State</label>
          <Input 
            type="text"
            name="ssl_self_state"
            onChange={(e, {name, value}) => form.setData(name, value)}
            disabled={form.data.ssl_generate_le}
            value={form.data.ssl_self_state}
          />
        </Form.Field>
        <Form.Field>
          <label>Locality</label>
          <Input 
            type="text"
            name="ssl_self_locality"
            onChange={(e, {name, value}) => form.setData(name, value)}
            disabled={form.data.ssl_generate_le}
            value={form.data.ssl_self_locality}
          />
        </Form.Field>
        <Form.Field>
          <label>Organisation</label>
          <Input 
            type="text" 
            name="ssl_self_organisation"
            onChange={(e, {name, value}) => form.setData(name, value)}
            disabled={form.data.ssl_generate_le}
            value={form.data.ssl_self_organisation}
          />
        </Form.Field>
        <Form.Field>
          <label>Organisation Unit</label>
          <Input 
            type="text" 
            name="ssl_self_organisation_unit"
            onChange={(e, {name, value}) => form.setData(name, value)}
            disabled={form.data.ssl_generate_le}
            value={form.data.ssl_self_organisation_unit}
          />
        </Form.Field>
        <Form.Field>
          <label>Country</label>
          <CountriesDropdown
            name="ssl_self_country"
            onChange={(e, {name, value}) => form.setData(name, value)}
            disabled={form.data.ssl_generate_le}
            value={form.data.ssl_self_country}
          />
        </Form.Field>
        <Form.Field>
          <label>Domain</label>
          <Input type="text" name="ssl_domain" disabled value={form.data.domain} />
        </Form.Field>
      </Form.Group>
    ),
    2: () => (
      <Form.Group>
        <Form.Field width={16}>
          <label>Private key</label>
          <TextArea rows={20} />
        </Form.Field>
        <Form.Field width={16}>
        <label>Fullchain</label>
        <TextArea rows={20} />
      </Form.Field>
    </Form.Group>
    ),
    3: () => (
      <Form.Group>
        <Form.Field>
          <Checkbox
            label="Generate a wildcard certificate ? (DNS validation needed)"
            name="ssl_le_wildcard"
            onChange={(e, {name, checked}) => form.setData(name, checked?1:0)}
            value={form.data.ssl_wildcard}
          />
        </Form.Field>
      </Form.Group>
    )
  };

  return (
    <>
      <SslChoiceDropdown />
      {value === 1 | 2 | 3
        ? <div className="p-10">{sslChoices[form.data.ssl_form]()}</div>
        : <p>Selectionnez une option</p>
      }
    </>
  )
}